import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { PageRecord } from '../../../../packages/contracts';
import { DomainError } from '../domain/errors';
import { atomicWrite, safeFile, scanMarkdown, validatePath } from './filesystem';

export class ContentFiles {
  constructor(readonly directory: string, private readonly maxBytes: number) {}

  validateContent(content: string): void {
    if (Buffer.byteLength(content) > this.maxBytes) throw new DomainError('error.tooLarge', 413);
  }
  assertAvailable(file: string, pages: PageRecord[], except?: string): void {
    validatePath(file);
    if ((file.toLowerCase() === 'home.md' && file !== 'home.md') || pages.some(page => !page.deleted && page.id !== except && page.path.toLowerCase() === file.toLowerCase())) throw new DomainError('error.pathExists', 409);
  }
  async import(): Promise<PageRecord[]> {
    const paths = await scanMarkdown(this.directory);
    if (!paths.includes('home.md')) throw new DomainError('error.homeMissing', 503);
    const pages: PageRecord[] = [];
    for (const file of paths) {
      this.assertAvailable(file, pages);
      const content = await fs.readFile(await safeFile(this.directory, file), 'utf8');
      this.validateContent(content);
      pages.push({ id: randomUUID(), path: file, content, aliases: [], deleted: false, revision: randomUUID(), updatedAt: new Date().toISOString() });
    }
    return pages;
  }
  async verify(pages: PageRecord[]): Promise<void> {
    const paths = await scanMarkdown(this.directory);
    const live = pages.filter(page => !page.deleted);
    if (paths.length !== live.length || live.some(page => !paths.includes(page.path))) throw new DomainError('error.externalChanges', 503);
    for (const page of live) {
      if (await fs.readFile(await safeFile(this.directory, page.path), 'utf8') !== page.content) throw new DomainError('error.externalChanges', 503);
    }
  }
  async mirror(before: PageRecord[], after: PageRecord[]): Promise<void> {
    const live = after.filter(page => !page.deleted);
    const paths = new Set(live.map(page => page.path));
    for (const page of before.filter(page => !page.deleted)) {
      if (!paths.has(page.path)) await fs.rm(await safeFile(this.directory, page.path), { force: true });
    }
    for (const page of live) await atomicWrite(await safeFile(this.directory, page.path), page.content);
  }
}
