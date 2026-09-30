import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../apps/server/src/config';
import { fixture } from './helpers';

test('local ports select the matching app and generate matching admin origins', async () => {
  const env = { PUBLIC_PORT: '5095', ADMIN_PORT: '5096' };
  assert.equal((await loadConfig('public', env)).port, 5095);
  const admin = await loadConfig('admin', env);
  assert.equal(admin.port, 5096);
  assert.deepEqual(admin.adminOrigins, ['http://localhost:5096', 'http://127.0.0.1:5096']);
  assert.equal((await loadConfig('public', {})).port, 3000);
  assert.equal((await loadConfig('admin', {})).port, 3001);
  await assert.rejects(loadConfig('admin', { ADMIN_PORT: 'invalid' }));
});

test('an explicit process port retains precedence for Docker and direct overrides', async () => {
  const env = { PORT: '3000', PUBLIC_PORT: '5095', ADMIN_PORT: '5096' };
  assert.equal((await loadConfig('public', env)).port, 3000);
  assert.equal((await loadConfig('admin', env)).port, 3000);
});

test('SITE_CONFIG_FILE loads custom site settings and retains the legacy fallback', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const file = path.join(f.root, 'custom-site.json');
  await fs.writeFile(file, JSON.stringify({ ...f.config.site, brand: { name: 'Configuration test', logoUrl: null } }));
  const config = await loadConfig('public', { SITE_CONFIG_FILE: file, SITE_CONFIG: 'missing-legacy-file.json' });
  assert.equal(config.site.brand.name, 'Configuration test');
  assert.equal((await loadConfig('public', { SITE_CONFIG: file })).site.brand.name, 'Configuration test');
});
