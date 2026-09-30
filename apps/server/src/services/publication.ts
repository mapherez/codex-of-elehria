import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { PageRecord, Publication } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';
import { DomainError, isErrno } from '../domain/errors';
import { buildNavigation } from '../domain/navigation';
import { MarkdownRenderer } from '../domain/markdown';
import { atomicWrite, readJson, scanMarkdown, serialize } from '../infrastructure/filesystem';

export const publicationPath = (root: string): string => path.join(root, '.wiki', 'publication.json');

export class Publisher {
  constructor(private readonly root: string, private readonly renderer: MarkdownRenderer, private readonly locale: string) {}
  async publish(pages: PageRecord[], revision: string): Promise<void> {
    const paths = await scanMarkdown(this.root);
    const snapshot: Publication = {
      schema: 1, revision, publishedAt: new Date().toISOString(), navigation: buildNavigation(paths, this.locale),
      pages: pages.filter(page => !page.deleted).map(page => ({
        id: page.id, path: page.path, aliases: page.aliases, revision: page.revision,
        ...this.renderer.render(page.content, page.path)
      }))
    };
    const internal = path.join(this.root, '.wiki');
    const stat = await fs.lstat(internal).catch((error: unknown) => { if (!isErrno(error, 'ENOENT')) throw error; });
    if (stat?.isSymbolicLink()) throw new DomainError('error.symbolicLink', 400, { path: '.wiki' });
    await atomicWrite(publicationPath(this.root), serialize(snapshot));
  }
}

export class PublicationReader extends EventEmitter {
  current: Publication | null = null;
  private stamp = '';
  private pending: Promise<void> | null = null;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private readonly root: string, private readonly t: Translator) { super(); }

  async start(interval: number): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => { void this.refresh(); }, interval);
    this.timer.unref();
  }
  refresh(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.load().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async load(): Promise<void> {
    try {
      const stat = await fs.stat(publicationPath(this.root));
      const stamp = `${stat.mtimeMs}:${stat.size}:${stat.ino}`;
      if (stamp === this.stamp) return;
      const next = await readJson<Publication>(publicationPath(this.root));
      if (next.schema !== 1 || !Array.isArray(next.pages) || !Array.isArray(next.navigation)) throw new DomainError('error.publication');
      const changed = this.current?.revision !== next.revision;
      this.current = next;
      this.stamp = stamp;
      if (changed) this.emit('publication', next.revision);
    } catch (error) {
      if (!isErrno(error, 'ENOENT')) console.error(this.t('error.publication'));
    }
  }
  require(): Publication {
    if (!this.current) throw new DomainError('error.notPublished', 503);
    return this.current;
  }
  async close(): Promise<void> { clearInterval(this.timer); await this.pending; this.removeAllListeners(); }
}
