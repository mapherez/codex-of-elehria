import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PageRecord, Publication, PublicationStatus } from '../../../../packages/contracts';
import { DomainError } from '../domain/errors';
import { atomicWrite, exists, readJson, serialize } from '../infrastructure/filesystem';
import type { GitRepository } from '../infrastructure/git-repository';
import { Publisher, publicationPath } from './publication';

interface PublishedVersion { id: string; commit: string; revision: string }
interface PublishedState { schema: 1; versions: PublishedVersion[]; snapshot: Publication }

// The durable state is also the publication intent. If copying the snapshot to
// the public mount is interrupted, replay this exact snapshot, never the drafts.
export class PublishedVersions {
  private state!: PublishedState;
  private records: PageRecord[] = [];
  private readonly file: string;
  constructor(stateDir: string, private readonly contentDir: string, private readonly repository: GitRepository, private readonly publisher: Publisher) {
    this.file = path.join(stateDir, 'published.json');
  }

  async initialize(): Promise<void> {
    if (await exists(this.file)) {
      const state = await readJson<PublishedState>(this.file);
      if (state.schema !== 1 || !Array.isArray(state.versions) || state.snapshot?.schema !== 1) throw new DomainError('error.publishedState', 503);
      // Large collections must not spawn one Git process per note at once.
      for (let offset = 0; offset < state.versions.length; offset += 8) {
        this.records.push(...await Promise.all(state.versions.slice(offset, offset + 8).map(async version => {
          const page = await this.repository.version(version.id, version.commit);
          if (page.deleted || page.id !== version.id || page.revision !== version.revision) throw new DomainError('error.publishedState', 503);
          return page;
        })));
      }
      if (!Array.isArray(state.snapshot.pages) || state.snapshot.pages.length !== this.records.length
        || state.snapshot.pages.some(page => !this.records.some(record => record.id === page.id && record.revision === page.revision && record.path === page.path))) {
        throw new DomainError('error.publishedState', 503);
      }
      this.state = state;
    } else {
      const oldFile = publicationPath(this.contentDir);
      const snapshot = await exists(oldFile) ? await readJson<Publication>(oldFile) : await this.publisher.render([], randomUUID());
      if (snapshot.schema !== 1 || !Array.isArray(snapshot.pages)) throw new DomainError('error.publishedState', 503);
      const head = await this.repository.head();
      const versions: PublishedVersion[] = [];
      for (const published of snapshot.pages) {
        if (!head) throw new DomainError('error.publishedState', 503);
        let page = await this.repository.version(published.id, head);
        let commit = head;
        if (page.revision !== published.revision) {
          let found = false;
          for (const entry of await this.repository.history(published.id)) {
            page = await this.repository.version(published.id, entry.commit);
            if (page.revision === published.revision) { commit = entry.commit; found = true; break; }
          }
          if (!found) throw new DomainError('error.publishedState', 503);
        }
        if (page.deleted || page.path !== published.path) throw new DomainError('error.publishedState', 503);
        versions.push({ id: page.id, commit, revision: page.revision });
        this.records.push(page);
      }
      this.state = { schema: 1, versions, snapshot };
      await atomicWrite(this.file, serialize(this.state));
    }
    await this.flush();
  }

  status(page: PageRecord): PublicationStatus {
    const published = this.state.versions.find(version => version.id === page.id);
    return !published ? 'draft' : published.revision === page.revision ? 'published' : 'changes';
  }

  async flush(): Promise<void> {
    const file = publicationPath(this.contentDir);
    if (await exists(file)) {
      const current = await readJson<Publication>(file);
      if (current.revision === this.state.snapshot.revision) return;
    }
    await this.publisher.write(this.state.snapshot);
  }

  async publish(page: PageRecord, commit: string): Promise<boolean> {
    if (this.records.some(other => other.id !== page.id && other.path.toLowerCase() === page.path.toLowerCase())) throw new DomainError('error.publishedPath', 409);
    const records = this.records.some(other => other.id === page.id)
      ? this.records.map(other => other.id === page.id ? structuredClone(page) : other)
      : this.records.concat(structuredClone(page));
    const versions = this.state.versions.filter(other => other.id !== page.id).concat({ id: page.id, commit, revision: page.revision });
    const snapshot = await this.publisher.render(records, randomUUID());
    if (this.status(page) === 'published' && JSON.stringify([snapshot.navigation, snapshot.pages]) === JSON.stringify([this.state.snapshot.navigation, this.state.snapshot.pages])) {
      await this.flush(); return false;
    }
    await this.replace(records, versions, snapshot);
    return true;
  }

  async remove(id: string): Promise<void> {
    if (!this.state.versions.some(version => version.id === id)) return;
    await this.replace(this.records.filter(page => page.id !== id), this.state.versions.filter(version => version.id !== id));
  }

  async publishMany(pages: PageRecord[], commit: string): Promise<void> {
    const updates = new Map(pages.map(page => [page.id, structuredClone(page)]));
    const records = this.records.map(page => updates.get(page.id) || page);
    const existing = new Set(this.records.map(page => page.id));
    records.push(...pages.filter(page => !existing.has(page.id)).map(page => updates.get(page.id)!));
    const paths = new Set<string>();
    for (const page of records) {
      const key = page.path.toLowerCase();
      if (paths.has(key)) throw new DomainError('error.publishedPath', 409);
      paths.add(key);
    }
    const versions = this.state.versions.filter(version => !updates.has(version.id))
      .concat(pages.map(page => ({ id: page.id, commit, revision: page.revision })));
    // Render and persist the whole batch once; the public reader never sees a partial batch.
    await this.replace(records, versions);
  }

  private async replace(records: PageRecord[], versions: PublishedVersion[], snapshot?: Publication): Promise<void> {
    const state: PublishedState = { schema: 1, versions, snapshot: snapshot || await this.publisher.render(records, randomUUID()) };
    // Advance the durable intent only after rendering succeeds.
    await atomicWrite(this.file, serialize(state));
    this.state = state; this.records = records;
    try { await this.flush(); }
    catch { throw new DomainError('error.publishPending', 503, {}, { committed: true }); }
  }
}
