import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DomainError, isErrno } from '../domain/errors';

export function validatePath(value: string, markdown = true): string {
  if (!value || value.length > 1024 || value !== value.normalize('NFC')) throw new DomainError('error.invalidPath');
  if (value.split('/').some(segment => !segment || segment.startsWith('.') || /[\\<>:"|?*\x00-\x1f\x7f]/u.test(segment) || /[ .]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment))) throw new DomainError('error.invalidPath');
  if (markdown && !/\.md$/i.test(value)) throw new DomainError('error.markdownExtension');
  return value;
}

export async function safeFile(root: string, relative: string): Promise<string> {
  validatePath(relative, false);
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch((error: unknown) => { if (!isErrno(error, 'ENOENT')) throw error; });
    if (stat?.isSymbolicLink()) throw new DomainError('error.symbolicLink', 403, { path: relative });
  }
  return current;
}

export function assertImportPath(file: string, others: string[]) {
  const segments = file.split('/');
  for (const other of others) {
    const lower = file.toLowerCase(); const compared = other.toLowerCase();
    if (lower === compared || lower.startsWith(compared + '/') || compared.startsWith(lower + '/')) throw new DomainError('error.pathExists', 409);
    const parts = other.split('/');
    for (let index = 0; index < Math.min(segments.length, parts.length) - 1; index++) {
      if (segments[index]!.toLowerCase() !== parts[index]!.toLowerCase()) break;
      if (segments[index] !== parts[index]) throw new DomainError('error.pathExists', 409);
    }
  }
}

export async function atomicWrite(file: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temporary, data, { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}
export async function exists(file: string): Promise<boolean> {
  return Boolean(await fs.lstat(file).catch((error: unknown) => { if (!isErrno(error, 'ENOENT')) throw error; }));
}
export const serialize = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';

export async function scanMarkdown(root: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(path.join(root, prefix), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new DomainError('error.symbolicLink', 400, { path: relative });
    if (entry.isDirectory()) result.push(...await scanMarkdown(root, relative));
    else if (entry.isFile() && /\.md$/i.test(entry.name)) result.push(validatePath(relative));
  }
  return result.sort();
}
