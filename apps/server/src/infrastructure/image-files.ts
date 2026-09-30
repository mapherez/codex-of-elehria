import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DomainError, isErrno } from '../domain/errors';
import { imageExtension, ImageIndex } from '../domain/wiki-images';
import { safeFile, validatePath } from './filesystem';

export class ImageFiles {
  constructor(private readonly contentDir: string) {}
  async paths(): Promise<string[]> {
    const root = await safeFile(this.contentDir, '_images');
    const result: string[] = [];
    async function visit(prefix = ''): Promise<void> {
      const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true }).catch((error: unknown) => {
        if (isErrno(error, 'ENOENT')) return [];
        throw error;
      });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const relative = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isSymbolicLink()) throw new DomainError('error.symbolicLink', 400, { path: '_images/' + relative });
        if (entry.isDirectory()) await visit(relative);
        else if (entry.isFile() && imageExtension.test(entry.name)) result.push(validatePath(relative, false));
      }
    }
    await visit();
    return result.sort();
  }
  async index(): Promise<ImageIndex> { return new ImageIndex(await this.paths()); }
  private async hash(relative: string): Promise<string> {
    const file = await safeFile(this.contentDir, '_images/' + validatePath(relative, false));
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    return hash.digest('hex');
  }
  async selected(input: { path?: string; name: string; sha256: string }): Promise<string> {
    const paths = await this.paths();
    if (input.path !== undefined) {
      validatePath(input.path, false);
      if (!paths.includes(input.path) || await this.hash(input.path) !== input.sha256) throw new DomainError('error.imageSelection');
      return input.path;
    }
    const matches: string[] = [];
    for (const file of paths.filter(file => path.posix.basename(file) === input.name)) {
      if (await this.hash(file) === input.sha256) matches.push(file);
    }
    if (!matches.length) throw new DomainError('error.imageSelection');
    if (matches.length > 1) throw new DomainError('error.imageSelectionAmbiguous');
    return matches[0]!;
  }
}
