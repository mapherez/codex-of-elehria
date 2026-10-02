import { resolveTheme } from '../../../../packages/theme';
import express, { Router, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { RuntimeConfig } from '../config';
import { createTranslator } from '../../../../packages/i18n';
import { fileFromLocation, pageUrl } from '../../../../packages/contracts/routes';
import { DomainError } from '../domain/errors';
import { safeFile } from '../infrastructure/filesystem';
import { GitRepository } from '../infrastructure/git-repository';
import { ContentFiles } from '../infrastructure/content-files';
import { ImageFiles } from '../infrastructure/image-files';
import { MarkdownRenderer } from '../domain/markdown';
import { Publisher, PublicationReader } from '../services/publication';
import { WikiService } from '../services/wiki-service';
import { PublishedVersions } from '../services/published-versions';
import { adminRoutes } from './admin-routes';
import { securityHeaders, localAccess, errorHandler } from './security';
import { NoxSync } from '../services/nox-sync';
import { noxRoutes } from './nox-routes';
import { SearchIndex } from '../domain/search';
import { RelationshipIndex } from '../domain/relationships';
import { searchQuerySchema, relationshipsQuerySchema } from '../../../../packages/contracts';
import { isImportedImage } from '../domain/imported-images';

const mediaTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export async function createApplication(config: RuntimeConfig) {
  const colorScheme = resolveTheme(config.site.theme).colorScheme;
  const t = createTranslator(config.site.locale, config.messages);
  const renderer = new MarkdownRenderer(t, config.site.basePath);
  let wiki: WikiService | undefined;
  let nox: NoxSync | undefined;
  if (config.mode === 'admin') {
    const repository = new GitRepository(config.stateDir, config.site.gitAuthor);
    const published = new PublishedVersions(config.stateDir, config.contentDir, repository, new Publisher(config.contentDir, renderer, config.site.locale));
    wiki = new WikiService(config.stateDir,
      repository,
      new ContentFiles(config.contentDir, config.site.maxPageBytes),
      new Publisher(config.contentDir, renderer, config.site.locale, config.stateDir), published, t);
    await wiki.initialize();
    nox = new NoxSync(config.stateDir, config.contentDir, config.site.maxPageBytes, wiki);
    try { await nox.initialize(); } catch (error) { await nox.close(); await wiki.close(); throw error; }
  }
  const reader = new PublicationReader(config.mode === 'admin' ? config.stateDir : config.contentDir, t);
  await reader.start(config.site.publicationPollMs);
  const token = randomBytes(32).toString('hex');
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  if (config.mode === 'admin') app.use(localAccess(config.adminOrigins, token));
  app.use(express.json({ limit: config.site.maxPageBytes * 6 + 4096 }));
  const routes = Router();
  const search = new SearchIndex(t);
  const relationships = new RelationshipIndex(t);
  app.use(config.site.basePath || '/', routes);

  routes.get('/healthz', (_req, res) => res.status(reader.current ? 200 : 503).json({ ready: Boolean(reader.current) }));
  routes.get('/api/config', (_req, res) => res.json({ theme: config.site.theme, brand: config.site.brand, locale: config.site.locale, messages: config.messages, basePath: config.site.basePath }));
  routes.get('/api/navigation', async (_req, res) => {
    await reader.refresh();
    const publication = reader.require();
    res.json({ revision: publication.revision, navigation: publication.navigation, count: publication.pages.length });
  });
  routes.get('/api/page', async (req, res) => {
    await reader.refresh();
    const publication = reader.require();
    const requested = String(req.query.path || 'home.md');
    const page = publication.pages.find(item => item.path === requested) || publication.pages.find(item => item.aliases.includes(requested));
    if (!page) throw new DomainError('error.notFound', 404);
    search.update(publication);
    res.json({ ...page, html: search.page(page).html, publication: publication.revision, redirected: page.path !== requested });
  });
  routes.get('/api/search', async (req, res) => {
    const input = searchQuerySchema.parse(req.query);
    await reader.refresh();
    res.json(search.search(reader.require(), input.q, input.offset, input.limit));
  });
  routes.get('/api/relationships', async (req, res) => {
    const input = relationshipsQuerySchema.parse(req.query);
    await reader.refresh();
    res.json(relationships.local(reader.require(), input.path, config.mode === 'admin'));
  });
  const clients = new Set<Response>();
  const broadcast = (revision: string): void => {
    for (const client of clients) client.write(`event: publication\ndata: ${JSON.stringify({ revision })}\n\n`);
  };
  reader.on('publication', broadcast);
  const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
  heartbeat.unref();
  routes.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write('retry: 1500\n\n');
    clients.add(res);
    if (reader.current) res.write(`event: publication\ndata: ${JSON.stringify({ revision: reader.current.revision })}\n\n`);
    req.on('close', () => clients.delete(res));
  });
  if (wiki) routes.use('/api/admin', adminRoutes(wiki, renderer, token, new ImageFiles(config.contentDir), { maxBytes: config.site.maxPageBytes, untitled: t('editor.new') }));
  if (nox) routes.use('/api/admin/nox', noxRoutes(nox));
  routes.get(/^\/media\/(.+)$/, async (req, res) => {
    const relative = String(req.params[0]);
    if (config.mode === 'public' && isImportedImage(relative)) {
      await reader.refresh();
      if (!reader.current?.importedMedia?.includes(relative)) throw new DomainError('error.notFound', 404);
    }
    const type = mediaTypes[path.extname(relative).toLowerCase()];
    if (!type) throw new DomainError('error.notFound', 404);
    const file = await safeFile(config.contentDir, relative);
    const stat = await fs.stat(file).catch(() => { throw new DomainError('error.notFound', 404); });
    if (!stat.isFile()) throw new DomainError('error.notFound', 404);
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    // safeFile rejects hidden relative paths; the host mount itself may live
    // under a hidden directory such as ~/.docker.
    res.type(type).sendFile(file, { dotfiles: 'allow' });
  });
  routes.use('/assets', express.static(path.join(config.webDir, 'assets'), { dotfiles: 'deny', fallthrough: false, immutable: true, maxAge: '1y' }));
  routes.get(['/', '/search', /^\/wiki\/.+/], async (req, res) => {
    await reader.refresh();
    if (req.path.startsWith('/wiki/') && reader.current) {
      const requested = fileFromLocation(req.path);
      if (!requested) throw new DomainError('error.invalidPath');
      const page = reader.current.pages.find(page => page.path === requested)
        || reader.current.pages.find(page => page.aliases.includes(requested));
      if (page) {
        const canonical = pageUrl(page.path, config.site.basePath);
        if (config.site.basePath + req.path !== canonical) {
          const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
          return res.redirect(302, canonical + query);
        }
      }
    }
    const html = await fs.readFile(path.join(config.webDir, 'index.html'), 'utf8');
    res.type('html').send(html.replaceAll('./assets/', `${config.site.basePath}/assets/`)
      .replace('__SITE_NAME__', escapeHtml(config.site.brand.name))
      .replace('__SITE_LOCALE__', escapeHtml(config.site.locale))
      .replace('__SITE_BASE__', escapeHtml(config.site.basePath))
      .replace('__SITE_SCHEME__', colorScheme));
  });
  app.use((_req, _res, next) => next(new DomainError('error.notFound', 404)));
  app.use(errorHandler);
  return {
    app, wiki, reader, nox,
    async close(): Promise<void> {
      clearInterval(heartbeat);
      for (const response of clients) response.end();
      clients.clear();
      await reader.close();
      await nox?.close();
      await wiki?.close();
    }
  };
}
