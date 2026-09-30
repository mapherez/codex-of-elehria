import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PageRecord, HistoryEntry } from '../../../../packages/contracts';
import { DomainError } from '../domain/errors';
import { atomicWrite, readJson, serialize } from './filesystem';

const execute = promisify(execFile);
type PageMetadata = Omit<PageRecord, 'content'>;

export class GitRepository {
  readonly directory: string;
  constructor(stateDir: string, private readonly author: { name: string; email: string }) {
    this.directory = path.join(stateDir, 'repository');
  }

  async run(...args: string[]): Promise<string> {
    const environment = { ...process.env };
    for (const key of Object.keys(environment)) if (key.startsWith('GIT_')) delete environment[key];
    const { stdout } = await execute('git', [
      '-c', `core.hooksPath=${path.join(this.directory, 'disabled-hooks')}`,
      '-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-C', this.directory, ...args
    ], {
      env: { ...environment, GIT_AUTHOR_NAME: this.author.name, GIT_AUTHOR_EMAIL: this.author.email, GIT_COMMITTER_NAME: this.author.name, GIT_COMMITTER_EMAIL: this.author.email, GIT_TERMINAL_PROMPT: '0' },
      windowsHide: true, maxBuffer: 64 * 1024 * 1024
    });
    return stdout;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(path.join(this.directory, 'pages'), { recursive: true });
    await this.run('init', '--initial-branch=main');
  }
  async head(): Promise<string | null> {
    try { return (await this.run('rev-parse', '--verify', 'HEAD')).trim(); } catch { return null; }
  }
  async readPages(): Promise<PageRecord[]> {
    const names = (await fs.readdir(path.join(this.directory, 'pages'))).filter(name => name.endsWith('.json'));
    return Promise.all(names.map(async name => {
      const meta = await readJson<PageMetadata>(path.join(this.directory, 'pages', name));
      return { ...meta, content: await fs.readFile(path.join(this.directory, 'pages', `${meta.id}.md`), 'utf8') };
    }));
  }
  async writePages(pages: PageRecord[]): Promise<void> {
    for (const page of pages) {
      const { content, ...meta } = page;
      await atomicWrite(path.join(this.directory, 'pages', `${page.id}.md`), content);
      await atomicWrite(path.join(this.directory, 'pages', `${page.id}.json`), serialize(meta));
    }
  }
  async commit(message: string): Promise<void> {
    await this.run('add', '--', 'pages');
    await this.run('commit', '-m', message);
  }
  async rollback(head: string, before: PageRecord[], after: PageRecord[]): Promise<void> {
    // This repository is private application state, never the project's source repository.
    await this.run('reset', '--hard', head);
    const ids = new Set(before.map(page => page.id));
    for (const page of after) if (!ids.has(page.id)) {
      await fs.rm(path.join(this.directory, 'pages', `${page.id}.md`), { force: true });
      await fs.rm(path.join(this.directory, 'pages', `${page.id}.json`), { force: true });
    }
  }
  async history(id: string): Promise<HistoryEntry[]> {
    const log = await this.run('log', '--format=%H%x00%aI%x00%an%x00%B%x1e', '--', `pages/${id}.md`, `pages/${id}.json`);
    return log.split('\x1e').map(record => record.trim()).filter(Boolean).map(record => {
      const [commit, date, author, message] = record.split('\0');
      return { commit: commit!, date: date!, author: author!, message: message!.trim() };
    });
  }
  async version(id: string, commit: string): Promise<PageRecord> {
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new DomainError('error.revision');
    try {
      await this.run('merge-base', '--is-ancestor', commit, 'HEAD');
      const meta = JSON.parse(await this.run('show', `${commit}:pages/${id}.json`)) as PageMetadata;
      return { ...meta, content: await this.run('show', `${commit}:pages/${id}.md`) };
    } catch { throw new DomainError('error.revision', 404); }
  }
}
