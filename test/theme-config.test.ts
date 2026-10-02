import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../apps/server/src/config';
import { fixture } from './helpers';
test('optional site themes reach both APIs under basePath without changing publication state', async t=>{
  const f=await fixture();t.after(f.cleanup);
  f.config.site.theme={colors:{background:'#f5f6f8',surface:'#ffffff',text:'#20242b',accent:'#8c6a32',link:'#315f96'}};f.config.site.basePath='/codex';
  const admin=await f.start('admin'); const publicApp=await f.start('public');
  for(const app of [admin,publicApp]) {
    const response=await app.request('/codex/api/config');assert.equal(response.status,200);
    assert.deepEqual((await response.json()).theme,f.config.site.theme);
    const html=await (await app.request('/codex/')).text();
    assert.match(html,/<meta name="color-scheme" content="light"/);
  }
});
test('site configuration accepts partial valid themes and rejects unknown or unreadable themes', async t=>{
  const f=await fixture();t.after(f.cleanup);const file=path.join(f.root,'theme-site.json');
  await fs.writeFile(file,JSON.stringify({...f.config.site,theme:{colors:{accent:'#abc'}}}));
  assert.deepEqual((await loadConfig('public',{SITE_CONFIG_FILE:file})).site.theme,{colors:{accent:'#abc'}});
  for(const theme of [{colors:{accent:'red'}},{fonts:{body:'inherit'}},{colors:{text:'#15181c'}},{unknown:1},null]) {
    await fs.writeFile(file,JSON.stringify({...f.config.site,theme}));
    await assert.rejects(loadConfig('public',{SITE_CONFIG_FILE:file}),/error.config/);
  }
});
