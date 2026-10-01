import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import type { CreatePageInput, DeletePageInput, MovePageInput, MutationResult, PageRecord, PublishPageInput, RepairImageInput, SavePageInput } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';
import { DomainError } from '../domain/errors';
import { relocateImageBindings, relocateLinks } from '../domain/markdown';
import { ContentFiles } from '../infrastructure/content-files';
import { GitRepository } from '../infrastructure/git-repository';
import { assertImportPath, atomicWrite, exists, readJson, safeFile, serialize } from '../infrastructure/filesystem';
import { Publisher } from './publication';
import { ImageFiles } from '../infrastructure/image-files';
import { wikiImages } from '../domain/wiki-images';
import { PublishedVersions } from './published-versions';
import type { ImportBatchPage } from '../../../../packages/contracts/nox-sync';

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
    private readonly published: PublishedVersions,
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
      await this.published.initialize();
      await this.recover();
      const head = await this.repository.head();
      if (!head) await this.transaction([], await this.files.import(), this.t('git.import'));
      else {
        this.pages = await this.repository.readPages();
        await this.files.verify(this.pages);
        await this.refreshPreview(head);
      }
    } catch (error) { await this.close(); throw error; }
  }
  get(id: string): PageRecord {
    const page = this.pages.find(item => item.id === id);
    if (!page) throw new DomainError('error.notFound', 404);
    return page;
  }
  private async refreshPreview(head: string): Promise<void> {
    await this.publisher.publish(this.pages, head, page => this.published.status(page));
  }
  private async finish(before: PageRecord[], after: PageRecord[]): Promise<void> {
    await this.files.mirror(before, after);
    this.pages = after;
    for (const page of after) if (page.deleted) await this.published.remove(page.id);
    await this.refreshPreview((await this.repository.head())!);
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
    await this.finish(journal.before, this.pages);
    await fs.rm(this.journal);
  }
  private async transaction(before: PageRecord[], after: PageRecord[], message: string): Promise<void> {
    const journal: Journal = { beforeHead: await this.repository.head(), before, after, message };
    await atomicWrite(this.journal, serialize(journal));
    try {
      await this.repository.writePages(after);
      await this.repository.commit(message);
      await this.finish(before, after);
      await fs.rm(this.journal);
    } catch {
      const committed = (await this.repository.head()) !== journal.beforeHead;
      try { await this.recover(); }
      catch (error) { console.error(this.t('log.recovery', { reason: error instanceof Error ? error.message : String(error) })); }
      throw new DomainError(committed ? 'error.publicationPending' : 'error.gitSave', 503, {}, { committed });
    }
  }
  private serializeMutation<T>(action: () => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => { await this.recover(); await this.published.flush(); await this.files.verify(this.pages); return action(); });
    this.queue = task.catch(() => {});
    return task;
  }
  importBatch(inputs: ImportBatchPage[], installAssets: () => Promise<void>, expected: { id: string; revision: string }[] = []): Promise<{ id: string; path: string; unchanged: boolean }[]> {
    return this.serializeMutation(async () => {
      for (const item of expected) if (this.get(item.id).revision !== item.revision) throw new DomainError('error.noxLocalChanged', 409);
      const next = structuredClone(this.pages);
      const results: { id: string; path: string; unchanged: boolean }[] = [];
      let changed = false;
      for (const input of inputs) {
        const existing = input.id ? this.editable(input.id, input.expectedRevision!) : undefined;
        const target = existing?.path || input.path;
        this.files.assertAvailable(target, next, existing?.id);
        assertImportPath(target, next.filter(page => !page.deleted && page.id !== existing?.id).map(page => page.path));
        const segments = target.split('/');
        for (let index = 1; index < segments.length; index++) {
          const parent = await safeFile(this.files.directory, segments.slice(0, index).join('/'));
          if (await exists(parent) && !(await fs.stat(parent)).isDirectory()) throw new DomainError('error.pathExists', 409);
        }
        if (!existing && await exists(await safeFile(this.files.directory, target))) throw new DomainError('error.pathExists', 409);
        this.files.validateContent(input.content);
        if (existing && existing.content === input.content && JSON.stringify(existing.imageBindings || {}) === JSON.stringify(input.imageBindings)
          && existing.origin?.hash === input.origin.hash) {
          results.push({ id: existing.id, path: existing.path, unchanged: true }); continue;
        }
        const revision = randomUUID();
        const page: PageRecord = {
          ...(existing || { id: randomUUID(), path: target, aliases: [], deleted: false }),
          content: input.content, revision, updatedAt: new Date().toISOString(),
          origin: { ...input.origin, importedRevision: revision }, imageBindings: input.imageBindings
        };
        const index = next.findIndex(item => item.id === page.id);
        if (index < 0) next.push(page); else next[index] = page;
        results.push({ id: page.id, path: page.path, unchanged: false }); changed = true;
      }
      if (changed) { await installAssets(); await this.transaction(this.pages, next, this.t('git.noxImport', { count: results.filter(item => !item.unchanged).length })); }
      return results;
    });
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
  publish(id: string, input: PublishPageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      const page = this.editable(id, input.revision);
      const changed = await this.published.publish(page, (await this.repository.head())!);
      await this.refreshPreview((await this.repository.head())!);
      return { page, ...(!changed ? { unchanged: true } : {}) };
    });
  }
  repairImage(id: string, input: RepairImageInput): Promise<MutationResult> {
    return this.serializeMutation(async () => {
      const page = this.editable(id, input.revision);
      const embed = wikiImages(page.content)[input.occurrence];
      if (!embed) throw new DomainError('error.invalidRequest');
      const file = await new ImageFiles(this.files.directory).selected(input);
      const encoded = file.split('/').map(encodeURIComponent).join('/');
      // A root-level path needs ./ to distinguish it from a recursive basename lookup.
      const reference = file.includes('/') ? encoded : './' + encoded;
      const next = page.content.slice(0, embed.start) + `![[${reference}${embed.suffix}]]` + page.content.slice(embed.end);
      if (next === page.content) return { page, unchanged: true };
      this.files.validateContent(next);
      page.content = next;
      if (page.imageBindings) page.imageBindings['w:' + reference] = { path: '_images/' + file };
      return this.persist(page, this.t('git.image', { path: page.path }));
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
      page.imageBindings = relocateImageBindings(page.imageBindings, previous, input.path);
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
