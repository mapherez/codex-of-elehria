import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ImportBatchPage, ImportReview, NoxFile, NoxJob, NoxListing, NoxSettings, NoxVault } from '../../../../packages/contracts/nox-sync';
import { DomainError } from '../domain/errors';
import { assertImportPath, atomicWrite, exists, readJson, safeFile, serialize, validatePath } from '../infrastructure/filesystem';
import { bindImportedImages, importedImagePath } from '../domain/imported-images';
import type { WikiService } from './wiki-service';

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const remoteFiles = z.object({ vaultId: z.string(), serverRevision: integer, files: z.array(z.object({
  path: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/), size: integer, revision: integer
})) });
const remoteVaults = z.object({ vaults: z.array(z.object({ vaultId: z.string().min(1), name: z.string(), revision: integer })) });
interface Connection { id: string; url: string; apiKey: string }
interface Selection { listing: NoxListing; connectionId: string; expires: number }
interface Prepared {
  public: NoxJob; controller: AbortController; work: Promise<void>; selection: Selection;
  pages: Map<string, ImportBatchPage>; assets: Map<string, { source: string; file: NoxFile }>; directory: string;
}
const maxImageBytes = 100 * 1024 * 1024;
const lifetime = 24 * 60 * 60 * 1000;

async function hashFile(file: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function connectionId(url: string) {
  const hash = createHash('sha256').update('codex:nox-sync:' + url).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
async function* chunks(response: Response) {
  if (!response.body) throw new DomainError('error.noxContract', 502);
  const reader = response.body.getReader();
  try { while (true) { const next = await reader.read(); if (next.done) break; yield next.value; } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
async function parallel<T>(items: T[], action: (item: T) => Promise<void>) {
  let index = 0;
  // Wait for every worker, including on failure, before deleting staging files.
  const results = await Promise.allSettled(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) await action(items[index++]!);
  }));
  const failed = results.find(result => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
export class NoxSync {
  private connection?: Connection;
  private readonly settingsFile: string;
  private readonly stagingRoot: string;
  private readonly listings = new Map<string, Selection>();
  private readonly jobs = new Map<string, Prepared>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(stateDir: string, private readonly contentDir: string, private readonly maxPageBytes: number, private readonly wiki: WikiService) {
    this.settingsFile = path.join(stateDir, 'nox-sync.json');
    this.stagingRoot = path.join(stateDir, 'nox-imports');
    this.timer = setInterval(() => { void this.expire(); }, 60000); this.timer.unref();
  }
  async initialize() {
    if (await exists(this.settingsFile)) {
      const parsed = z.object({ id: z.string().uuid(), url: z.string(), apiKey: z.string().min(1) }).safeParse(await readJson(this.settingsFile));
      if (!parsed.success) throw new DomainError('error.config');
      this.connection = { ...parsed.data, url: this.normalizeUrl(parsed.data.url) };
    }
    // Only private, unapplied download preparations are removed on restart.
    await fs.rm(this.stagingRoot, { recursive: true, force: true });
    await fs.mkdir(this.stagingRoot, { recursive: true });
  }
  settings(): NoxSettings { return { url: this.connection?.url || '', hasKey: Boolean(this.connection?.apiKey), connectionId: this.connection?.id }; }
  private normalizeUrl(value: string) {
    try {
      const url = new URL(value.trim());
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      return url.href.replace(/\/+$/, '');
    } catch { throw new DomainError('error.invalidRequest'); }
  }
  private requireConnection() { if (!this.connection) throw new DomainError('error.noxAuth', 401); return { ...this.connection }; }
  private async remote(connection: Connection, endpoint: string, signal?: AbortSignal) {
    try {
      const response = await fetch(connection.url + endpoint, {
        headers: { authorization: 'Bearer ' + connection.apiKey }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403) throw new DomainError('error.noxAuth', 401);
        if (response.status === 409 || (response.status === 404 && endpoint.startsWith('/v1/files'))) throw new DomainError('error.noxChanged', 409);
        throw new DomainError('error.noxContract', 502);
      }
      return response;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError('error.noxConnection', 502);
    }
  }
  private async json(connection: Connection, endpoint: string) {
    const response = await this.remote(connection, endpoint);
    try {
      const parts: Uint8Array[] = []; let size = 0;
      for await (const chunk of chunks(response)) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) throw new Error();
        parts.push(chunk);
      }
      return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
    } catch { throw new DomainError('error.noxContract', 502); }
  }
  async connect(input: { url: string; apiKey?: string }) {
    if ([...this.jobs.values()].some(job => job.public.state === 'applying')) throw new DomainError('error.conflict', 409);
    const url = this.normalizeUrl(input.url);
    const apiKey = input.apiKey?.trim() || (url === this.connection?.url ? this.connection.apiKey : '');
    if (!apiKey || /[\r\n]/.test(apiKey)) throw new DomainError('error.noxAuth', 401);
    const candidate: Connection = { url, apiKey, id: url === this.connection?.url ? this.connection.id : connectionId(url) };
    const auth = z.object({ ok: z.literal(true) }).safeParse(await this.json(candidate, '/v1/auth/check'));
    if (!auth.success) throw new DomainError('error.noxContract', 502);
    const vaults = await this.vaults(candidate);
    await atomicWrite(this.settingsFile, serialize(candidate));
    await fs.chmod(this.settingsFile, 0o600);
    this.connection = candidate; this.listings.clear();
    for (const job of this.jobs.values()) if (['preparing', 'ready'].includes(job.public.state)) await this.cancel(job.public.id);
    return { settings: this.settings(), vaults };
  }
  async disconnect() {
    if ([...this.jobs.values()].some(job => job.public.state === 'applying')) throw new DomainError('error.conflict', 409);
    for (const job of this.jobs.values()) if (['preparing', 'ready'].includes(job.public.state)) await this.cancel(job.public.id);
    await fs.rm(this.settingsFile, { force: true }); this.connection = undefined; this.listings.clear();
    return this.settings();
  }
  async vaults(connection = this.requireConnection()): Promise<NoxVault[]> {
    const parsed = remoteVaults.safeParse(await this.json(connection, '/v1/vaults'));
    if (!parsed.success) throw new DomainError('error.noxContract', 502);
    return parsed.data.vaults;
  }
  async list(vaultId: string): Promise<NoxListing> {
    const connection = this.requireConnection();
    const parsed = remoteFiles.safeParse(await this.json(connection, '/v1/files?' + new URLSearchParams({ vaultId })));
    if (!parsed.success || parsed.data.vaultId !== vaultId || new Set(parsed.data.files.map(file => file.path)).size !== parsed.data.files.length) throw new DomainError('error.noxContract', 502);
    if (connection.id !== this.connection?.id || connection.apiKey !== this.connection.apiKey) throw new DomainError('error.noxExpired', 409);
    const listing = { ...parsed.data, listingId: randomUUID() };
    this.listings.set(listing.listingId, { listing, connectionId: connection.id, expires: Date.now() + lifetime });
    return listing;
  }
  private requireJob(id: string) { const job = this.jobs.get(id); if (!job) throw new DomainError('error.noxExpired', 410); return job; }
  job(id: string): NoxJob { return this.requireJob(id).public; }
  prepare(input: { listingId: string; paths: string[] }): NoxJob {
    const connection = this.requireConnection();
    const selection = this.listings.get(input.listingId);
    if (!selection || selection.expires < Date.now() || selection.connectionId !== connection.id) throw new DomainError('error.noxExpired', 410);
    if ([...this.jobs.values()].filter(job => ['preparing', 'ready', 'applying'].includes(job.public.state)).length >= 4) throw new DomainError('error.conflict', 409);
    const selected = [...new Set(input.paths)].map(file => selection.listing.files.find(item => item.path === file));
    if (selected.some(file => !file || !/\.md$/i.test(file.path))) throw new DomainError('error.invalidRequest');
    const id = randomUUID();
    const job: Prepared = {
      public: { id, state: 'preparing', completed: 0, total: selected.length, reviews: [] }, selection,
      controller: new AbortController(), work: Promise.resolve(), pages: new Map(), assets: new Map(), directory: path.join(this.stagingRoot, id)
    };
    this.jobs.set(id, job);
    job.work = this.prepareFiles(job, connection, selected as NoxFile[]).catch(async error => {
      if (job.public.state !== 'cancelled') {
        job.public.state = 'failed';
        job.public.error = error instanceof DomainError ? { code: error.code, params: error.params } : { code: 'error.noxConnection' };
      }
      await fs.rm(job.directory, { recursive: true, force: true });
    });
    return job.public;
  }
  private review(file: NoxFile, connection: Connection, vaultId: string): { review: ImportReview; page?: ImportBatchPage } {
    const base: ImportReview = { path: file.path, targetPath: file.path, status: 'new', warnings: [] };
    try {
      validatePath(file.path);
      if (file.path.toLowerCase() === 'home.md') throw new DomainError('error.noxHome');
      if (file.path.toLowerCase().startsWith('_images/')) throw new DomainError('error.noxReserved');
      const existing = this.wiki.pages.find(page => page.origin?.connectionId === connection.id && page.origin.vaultId === vaultId && page.origin.path === file.path);
      if (existing?.deleted) throw new DomainError('error.noxDeleted');
      const target = existing?.path || file.path;
      assertImportPath(target, this.wiki.pages.filter(page => !page.deleted && page.id !== existing?.id).map(page => page.path));
      base.targetPath = target;
      return { review: base, page: {
        path: target, ...(existing ? { id: existing.id, expectedRevision: existing.revision } : {}), content: '', imageBindings: {},
        origin: { connectionId: connection.id, vaultId, path: file.path, hash: file.hash, remoteRevision: file.revision }
      } };
    } catch (error) {
      base.status = 'blocked'; base.reason = error instanceof DomainError ? { code: error.code } : { code: 'error.invalidPath' };
      return { review: base };
    }
  }
  private async download(job: Prepared, connection: Connection, file: NoxFile, maxBytes: number) {
    job.controller.signal.throwIfAborted(); validatePath(file.path, false);
    if (file.size > maxBytes) throw new DomainError(maxBytes === maxImageBytes ? 'error.noxLimit' : 'error.tooLarge', 413);
    const parameters = new URLSearchParams({ vaultId: job.selection.listing.vaultId, path: file.path, expectedHash: file.hash, expectedRevision: String(file.revision) });
    const response = await this.remote(connection, '/v1/files/download?' + parameters, job.controller.signal);
    if (response.headers.get('x-nox-sync-hash') !== file.hash || response.headers.get('x-nox-sync-revision') !== String(file.revision)
      || response.headers.get('content-length') !== String(file.size)) { await response.body?.cancel(); throw new DomainError('error.noxIntegrity', 502); }
    const target = path.join(job.directory, randomUUID());
    const handle = await fs.open(target, 'wx', 0o600);
    let size = 0; const hash = createHash('sha256');
    try {
      for await (const chunk of chunks(response)) {
        job.controller.signal.throwIfAborted(); size += chunk.length;
        if (size > file.size || size > maxBytes) throw new DomainError('error.noxIntegrity', 502);
        hash.update(chunk); await handle.writeFile(chunk);
      }
    } finally { await handle.close(); }
    if (size !== file.size || hash.digest('hex') !== file.hash) throw new DomainError('error.noxIntegrity', 502);
    job.public.completed++; return target;
  }
  private async prepareFiles(job: Prepared, connection: Connection, selected: NoxFile[]) {
    await fs.mkdir(job.directory, { recursive: true });
    const vaultId = job.selection.listing.vaultId;
    // Hash the opaque vault ID for a stable, filesystem-safe namespace.
    const vaultKey = createHash('sha256').update(vaultId).digest('hex').slice(0, 24);
    const reviews = selected.map(file => this.review(file, connection, vaultId));
    const targets = reviews.filter(item => item.page).map(item => item.page!.path);
    for (const item of reviews) if (item.page) {
      try { assertImportPath(item.page.path, targets.filter(target => target !== item.page!.path)); }
      catch { item.review.status = 'blocked'; item.review.reason = { code: 'error.pathExists' }; item.page = undefined; }
    }
    job.public.reviews = reviews.map(item => item.review);
    job.public.total = reviews.filter(item => item.page).length;
    await parallel(reviews.map((item, index) => ({ ...item, file: selected[index]! })), async ({ page, review, file }) => {
      if (!page) return;
      const source = await this.download(job, connection, file, this.maxPageBytes);
      try { page.content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await fs.readFile(source)); }
      catch { throw new DomainError('error.noxContract', 502); }
      const linked = bindImportedImages(page.content, file.path, job.selection.listing.files, image => importedImagePath(connection.id, vaultKey, image));
      page.imageBindings = linked.bindings; review.warnings = linked.warnings;
      for (const image of linked.needed) {
        validatePath(image.path, false);
        const asset = importedImagePath(connection.id, vaultKey, image);
        if (!job.assets.has(asset)) job.assets.set(asset, { source: '', file: image });
      }
      if (page.id) {
        const local = this.wiki.get(page.id);
        const same = local.content === page.content && JSON.stringify(local.imageBindings || {}) === JSON.stringify(page.imageBindings)
          && local.origin?.hash === page.origin.hash;
        review.status = same ? 'unchanged' : local.revision === local.origin?.importedRevision ? 'update' : 'conflict';
        if (review.status === 'conflict') { review.localContent = local.content; review.remoteContent = page.content; }
      }
      job.pages.set(file.path, page);
    });
    job.public.total += job.assets.size;
    await parallel([...job.assets.values()], async asset => { asset.source = await this.download(job, connection, asset.file, maxImageBytes); });
    job.controller.signal.throwIfAborted(); job.public.state = 'ready';
  }
  async apply(id: string, input: { decisions: Record<string, 'keep' | 'replace'>; confirmReplace: boolean }) {
    const job = this.requireJob(id);
    if (job.public.state !== 'ready' || job.selection.expires < Date.now() || this.connection?.id !== job.selection.connectionId) throw new DomainError('error.noxExpired', 409);
    const chosen = job.public.reviews.filter(review => review.status !== 'blocked' && (review.status !== 'conflict' || input.decisions[review.path] === 'replace'));
    if (chosen.some(review => review.status === 'conflict') && !input.confirmReplace) throw new DomainError('error.invalidRequest');
    // Validate every reviewed local revision, including notes the user keeps.
    for (const page of job.pages.values()) if (page.id && this.wiki.get(page.id).revision !== page.expectedRevision) throw new DomainError('error.noxLocalChanged', 409);
    job.public.state = 'applying';
    try {
      job.public.result = await this.wiki.importBatch(chosen.map(review => job.pages.get(review.path)!), async () => {
        for (const [relative, asset] of job.assets) {
          const target = await safeFile(this.contentDir, relative);
          await fs.mkdir(path.dirname(target), { recursive: true });
          const temporary = target + '.' + randomUUID() + '.tmp';
          try {
            // Staging and content can be separate Docker mounts/filesystems.
            await fs.copyFile(asset.source, temporary, constants.COPYFILE_EXCL);
            await fs.link(temporary, target);
          }
          catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
            if (await hashFile(target) !== asset.file.hash) throw new DomainError('error.noxIntegrity', 409);
          }
          finally { await fs.rm(temporary, { force: true }); }
        }
      }, [...job.pages.values()].filter(page => page.id).map(page => ({ id: page.id!, revision: page.expectedRevision! })));
      job.public.state = 'done'; await fs.rm(job.directory, { recursive: true, force: true }); return job.public;
    } catch (error) {
      job.public.state = 'ready';
      if (error instanceof DomainError && error.code === 'error.conflict') throw new DomainError('error.noxLocalChanged', 409);
      throw error;
    }
  }
  async cancel(id: string) {
    const job = this.requireJob(id);
    if (job.public.state === 'applying') throw new DomainError('error.conflict', 409);
    job.public.state = 'cancelled'; job.controller.abort(); await job.work;
    await fs.rm(job.directory, { recursive: true, force: true }); return job.public;
  }
  private async expire() {
    for (const [id, selection] of this.listings) if (selection.expires < Date.now()) this.listings.delete(id);
    for (const [id, job] of this.jobs) if (job.selection.expires < Date.now() && job.public.state !== 'applying') {
      await this.cancel(id); this.jobs.delete(id);
    }
  }
  async close() {
    clearInterval(this.timer);
    for (const job of this.jobs.values()) if (job.public.state === 'preparing') job.controller.abort();
    await Promise.all([...this.jobs.values()].map(job => job.work));
  }
}
