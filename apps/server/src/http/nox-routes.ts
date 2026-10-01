import { Router } from 'express';
import { noxApplySchema, noxPrepareSchema, noxSettingsSchema } from '../../../../packages/contracts/nox-sync';
import type { NoxSync } from '../services/nox-sync';

export function noxRoutes(nox: NoxSync) {
  const router = Router();
  router.get('/connection', (_req, res) => res.json(nox.settings()));
  router.put('/connection', async (req, res) => res.json(await nox.connect(noxSettingsSchema.parse(req.body))));
  router.delete('/connection', async (_req, res) => res.json(await nox.disconnect()));
  router.get('/vaults', async (_req, res) => res.json(await nox.vaults()));
  router.get('/files', async (req, res) => res.json(await nox.list(String(req.query.vaultId || ''))));
  router.post('/imports', (req, res) => res.status(202).json(nox.prepare(noxPrepareSchema.parse(req.body))));
  router.get('/imports/:id', (req, res) => res.json(nox.job(req.params.id)));
  router.post('/imports/:id/apply', async (req, res) => res.json(await nox.apply(req.params.id, noxApplySchema.parse(req.body))));
  router.delete('/imports/:id', async (req, res) => res.json(await nox.cancel(req.params.id)));
  return router;
}
