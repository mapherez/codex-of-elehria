import { Router } from 'express';
import { diffLines } from 'diff';
import { createPageSchema, savePageSchema, movePageSchema, deletePageSchema, repairImageSchema, publishPageSchema, previewPageSchema } from '../../../../packages/contracts';
import type { WikiService } from '../services/wiki-service';
import type { MarkdownRenderer } from '../domain/markdown';
import type { ImageFiles } from '../infrastructure/image-files';
import { validatePath } from '../infrastructure/filesystem';
import { DomainError } from '../domain/errors';

export function adminRoutes(service: WikiService, renderer: MarkdownRenderer, token: string, images: ImageFiles, preview: { maxBytes: number; untitled: string }): Router {
  const router = Router();
  router.get('/session', (_req, res) => res.json({ token }));
  router.post('/preview', async (req, res) => {
    const input = previewPageSchema.parse(req.body);
    if (Buffer.byteLength(input.content) > preview.maxBytes) throw new DomainError('error.tooLarge', 413);
    const page = input.id ? service.get(input.id) : undefined;
    const source = validatePath(input.path || page?.path || 'preview.md');
    const notes = renderer.noteIndex([...service.pages.filter(item => item.id !== page?.id && item.path !== source),
      { path: source, aliases: page?.aliases || [], content: input.content, deleted: false }]);
    res.json(renderer.render(input.content, source, await images.index(), notes, page?.imageBindings,
      !input.path && !page ? preview.untitled : undefined));
  });
  router.get('/pages', (_req, res) => res.json(service.pages.map(({ content: _content, ...metadata }) => metadata)));
  router.get('/pages/:id', (req, res) => res.json(service.get(req.params.id)));
  router.post('/pages', async (req, res) => res.status(201).json(await service.create(createPageSchema.parse(req.body))));
  router.put('/pages/:id', async (req, res) => res.json(await service.save(req.params.id, savePageSchema.parse(req.body))));
  router.post('/pages/:id/publish', async (req, res) => res.json(await service.publish(req.params.id, publishPageSchema.parse(req.body))));
  router.post('/pages/:id/images', async (req, res) => res.json(await service.repairImage(req.params.id, repairImageSchema.parse(req.body))));
  router.post('/pages/:id/move', async (req, res) => res.json(await service.move(req.params.id, movePageSchema.parse(req.body))));
  router.delete('/pages/:id', async (req, res) => res.json(await service.delete(req.params.id, deletePageSchema.parse(req.body))));
  router.get('/pages/:id/history', async (req, res) => {
    service.get(req.params.id);
    res.json(await service.repository.history(req.params.id));
  });
  router.get('/pages/:id/versions/:commit', async (req, res) => {
    service.get(req.params.id);
    const version = await service.repository.version(req.params.id, req.params.commit);
    const notes = renderer.noteIndex([...service.pages.filter(page => page.id !== req.params.id), { ...version, deleted: false }]);
    res.json({ ...version, ...renderer.render(version.content, version.path, await images.index(), notes, version.imageBindings) });
  });
  router.get('/pages/:id/diff', async (req, res) => {
    service.get(req.params.id);
    const [before, after] = await Promise.all([
      service.repository.version(req.params.id, String(req.query.from)),
      service.repository.version(req.params.id, String(req.query.to))
    ]);
    res.json({
      before: { path: before.path, deleted: before.deleted },
      after: { path: after.path, deleted: after.deleted },
      changes: diffLines(before.deleted ? '' : before.content, after.deleted ? '' : after.content)
    });
  });
  return router;
}
