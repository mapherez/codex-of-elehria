import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { CreatePageInput, DeletePageInput, MovePageInput, MutationResult, PageRecord, SavePageInput } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';
import { DomainError } from '../domain/errors';
import { relocateLinks } from '../domain/markdown';
import { ContentFiles } from '../infrastructure/content-files';
import { GitRepository } from '../infrastructure/git-repository';
import { atomicWrite, exists, readJson, safeFile, serialize } from '../infrastructure/filesystem';
import { Publisher } from './publication';

interface Journal { beforeHead: string | null; before: PageRecord[]; after: PageRecord[]; message: string }

export class WikiService {
  pages: PageRecord[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private release?: () => Promise<void>;
  private readonly journal: string;
  constructor(
    private readonly stateDir: string,
    readonly repository: GitRepository,
    private readonly files: ContentFiles,
    private readonly publisher: Publisher,
    private readonly t: Translator
  ) { this.journal = path.join(stateDir, 'transaction.json'); }

  async initialize(): Promise<void> {
    await fs.mkdir(this.stateDir, { recursive: true });
    await fs.mkdir(this.files.directory, { recursive: true });
    this.release = await lockfile.lock(this.stateDir, {
      lockfilePath: path.join(this.stateDir, '.writer.lock'),
      stale: 10000, retries: { retries: 5, minTimeout: 2000, maxTimeout: 2000 }
    });
    try {
      await this.repository.initialize();
      await this.recover();
      const head = await this.repository.head();
      if (!head) await this.transaction([], await this.files.import(), this.t('git.import'));
      else {
        this.pages = await this.repository.readPages();
        await this.files.verify(this.pages);
        await this.publisher.publish(this.pages, head);
      }
    } catch (error) { await this.close(); throw error; }
  }
  get(id: string): PageRecord {
    const page = this.pages.find(item => item.id === id);
    if (!page) throw new DomainError('error.notFound', 404);
    return page;
  }
  private async recover(): Promise<void> {
    if (!await exists(this.journal)) return;
    const journal = await readJson<Journal>(this.journal);
    const head = await this.repository.head();
    if (!head && !journal.beforeHead) {
      await this.repository.writePages(journal.after);
      await this.repository.commit(journal.message);
    } else if (head === journal.beforeHead && head) {
      await this.repository.rollback(head, journal.before, journal.after);
      this.pages = journal.before;
      await fs.rm(this.journal);
      return;
    }
    this.pages = await this.repository.readPages();
    await this.files.mirror(journal.before, this.pages);
    await this.publisher.publish(this.pages, (await this.repository.head())!);
    await fs.rm(this.journal);
  }
  private async transaction(before: PageRecord[], after: PageRecord[], message: string): Promise<void> {
    const journal: Journal = { beforeHead: await this.repository.head(), before, after, message };
    await atomicWrite(this.journal, serialize(journal));
    try {
      await this.repository.writePages(after);
      await this.repository.commit(message);
      await this.files.mirror(before, after);
      await this.publisher.publish(after, (await this.repository.head())!);
      this.pages = after;
      await fs.rm(this.journal);
    } catch {
      const committed = (await this.repository.head()) !== journal.beforeHead;
      try { await this.recover(); }
      catch (error) { console.error(this.t('log.recovery', { reason: error instanceof Error ? error.message : String(error) })); }
      throw new DomainError(committed ? 'error.publicationPending' : 'error.gitSave', 503, {}, { committed });
    }
  }
  private serializeMutation(action: () => Promise<MutationResult>): Promise<MutationResult> {
    const task = this.queue.then(async () => { await this.recover(); await this.files.verify(this.pages); return action(); });
    this.queue = task.catch(() => {});
    return task;
  }
  private editable(id: string, revision: string): PageRecord {
    const page = this.get(id);
    if (page.deleted) throw new DomainError('error.notFound', 404);
    if (page.revision !== revision) throw new DomainError('error.conflict', 409, {}, { current: page });
    return structuredClone(page);
  }
  private async persist(page: PageRecord, description: string, summary?: string): Promise<MutationResult> {
    page.revision = randomUUID();
    page.updatedAt = new Date().toISOString();
    const next = this.pages.filter(item => item.id !== page.id).concat(page);
    const message = summary?.trim() ? `${description}\n\n${summary.trim()}` : description;
    await this.transaction(this.pages, next, message);
    return { page };
  }
  create(input: CreatePageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      this.files.assertAvailable(input.path, this.pages);
      this.files.validateContent(input.content);
      if (await exists(await safeFile(this.files.directory, input.path))) throw new DomainError('error.pathExists', 409);
      const page: PageRecord = { id: randomUUID(), path: input.path, aliases: [], deleted: false, content: input.content, revision: '', updatedAt: '' };
      return this.persist(page, this.t('git.create', { path: page.path }), input.message);
    });
  }
  save(id: string, input: SavePageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      const page = this.editable(id, input.revision);
      this.files.validateContent(input.content);
      if (page.content === input.content) return { page, unchanged: true };
      page.content = input.content;
      return this.persist(page, this.t('git.save', { path: page.path }), input.message);
    });
  }
  move(id: string, input: MovePageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      const page = this.editable(id, input.revision);
      if (page.path === 'home.md') throw new DomainError('error.homeProtected');
      this.files.assertAvailable(input.path, this.pages, id);
      if (page.path === input.path) return { page, unchanged: true };
      if (await exists(await safeFile(this.files.directory, input.path))) throw new DomainError('error.pathExists', 409);
      const previous = page.path;
      page.content = relocateLinks(page.content, previous, input.path);
      page.path = input.path;
      page.aliases = [...new Set([...page.aliases, previous])].filter(alias => alias !== input.path);
      return this.persist(page, this.t('git.move', { from: previous, path: page.path }), input.message);
    });
  }
  delete(id: string, input: DeletePageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      const page = this.editable(id, input.revision);
      if (page.path === 'home.md') throw new DomainError('error.homeProtected');
      page.deleted = true;
      return this.persist(page, this.t('git.delete', { path: page.path }), input.message);
    });
  }
  async close(): Promise<void> { await this.queue; if (this.release) { await this.release(); this.release = undefined; } }
}
