import { Router } from 'express';
import { diffLines } from 'diff';
import { createPageSchema, savePageSchema, movePageSchema, deletePageSchema, repairImageSchema } from '../../../../packages/contracts';
import type { WikiService } from '../services/wiki-service';
import type { MarkdownRenderer } from '../domain/markdown';
import type { ImageFiles } from '../infrastructure/image-files';

export function adminRoutes(service: WikiService, renderer: MarkdownRenderer, token: string, images: ImageFiles): Router {
  const router = Router();
  router.get('/session', (_req, res) => res.json({ token }));
  router.get('/pages', (_req, res) => res.json(service.pages.map(({ content: _content, ...metadata }) => metadata)));
  router.get('/pages/:id', (req, res) => res.json(service.get(req.params.id)));
  router.post('/pages', async (req, res) => res.status(201).json(await service.create(createPageSchema.parse(req.body))));
  router.put('/pages/:id', async (req, res) => res.json(await service.save(req.params.id, savePageSchema.parse(req.body))));
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
    res.json({ ...version, ...renderer.render(version.content, version.path, await images.index()) });
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
