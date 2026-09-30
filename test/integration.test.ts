import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HistoryEntry, MutationResult, PageRecord, PageResponse, VersionResponse, DiffResponse } from '../packages/contracts';
import { fixture } from './helpers';

test('URL prefixes apply to APIs, Markdown links and moved-page redirects', async t => {
  const f = await fixture(); t.after(f.cleanup);
  f.config.site.basePath = '/knowledge';
  const admin = await f.start('admin');
  const reader = await f.start('public');
  assert.equal((await reader.request('/api/navigation')).status, 404);
  assert.equal((await reader.request('/knowledge/api/navigation')).status, 200);
  const page = await (await reader.request('/knowledge/api/page?path=guides/first.md')).json() as PageResponse;
  assert.match(page.html, /href="\/knowledge\/"/);
  const moved = await admin.request(`/knowledge/api/admin/pages/${page.id}/move`, 'POST', { revision: page.revision, path: 'archive/first.md' });
  assert.equal(moved.status, 200);
  await reader.service.reader.refresh();
  const redirect = await reader.request('/knowledge/wiki/guides/first.md');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/knowledge/wiki/archive/first.md');
  assert.equal((await reader.request('/knowledge/api/admin/session')).status, 404);
});

test('end-to-end persistence, history, explicit renames, aliases and local-only controls', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const reader = await f.start('public');
  assert.equal((await reader.request('/api/admin/session')).status, 404);
  assert.equal((await reader.request('/api/admin/pages', 'POST', {})).status, 404);
  assert.equal((await reader.request('/media/.git/config')).status, 404);
  const blocked = await fetch(admin.url + '/api/admin/pages', { headers: { origin: 'https://attacker.invalid' } });
  assert.equal(blocked.status, 403);
  const csrf = await fetch(admin.url + '/api/admin/pages', { method: 'POST', headers: { host: 'localhost:4001', origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(csrf.status, 403);

  let created = await (await admin.request('/api/admin/pages', 'POST', { path: 'notes/new page.md', content: '# New page\n\n## First\nVersion one.\n', message: 'Initial research' })).json() as MutationResult;
  const id = created.page.id;
  assert.equal((await reader.request('/api/page?path=notes%2Fnew%20page.md')).status, 200);
  const firstRevision = created.page.revision;
  const noChange = await (await admin.request('/api/admin/pages/' + id, 'PUT', { revision: firstRevision, content: created.page.content })).json() as MutationResult;
  assert.equal(noChange.unchanged, true);
  assert.equal((await (await admin.request(`/api/admin/pages/${id}/history`)).json() as HistoryEntry[]).length, 1);
  created = await (await admin.request('/api/admin/pages/' + id, 'PUT', { revision: firstRevision, content: '# New page\n\n## Second\nVersion two.\n' })).json() as MutationResult;
  const conflict = await admin.request('/api/admin/pages/' + id, 'PUT', { revision: firstRevision, content: '# Stale edit' });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json() as { error: { current: PageRecord } }).error.current.revision, created.page.revision);
  const moved = await (await admin.request(`/api/admin/pages/${id}/move`, 'POST', { revision: created.page.revision, path: 'archive/renamed.md' })).json() as MutationResult;
  const old = await (await reader.request('/api/page?path=notes%2Fnew%20page.md')).json() as PageResponse;
  assert.equal(old.path, 'archive/renamed.md'); assert.equal(old.redirected, true);
  assert.equal((await reader.request('/wiki/notes/new%20page.md')).headers.get('location'), '/wiki/archive/renamed.md');
  const history = await (await admin.request(`/api/admin/pages/${id}/history`)).json() as HistoryEntry[];
  assert.equal(history.length, 3);
  assert.equal(history[0]!.author, f.config.site.gitAuthor.name);
  const first = await (await admin.request(`/api/admin/pages/${id}/versions/${history.at(-1)!.commit}`)).json() as VersionResponse;
  assert.match(first.content, /Version one/); assert.equal(first.path, 'notes/new page.md');
  const diff = await (await admin.request(`/api/admin/pages/${id}/diff?from=${history.at(-1)!.commit}&to=${history[0]!.commit}`)).json() as DiffResponse;
  assert.ok(diff.changes.some(part => part.added && part.value.includes('Version two')));
  assert.ok(diff.changes.some(part => part.removed && part.value.includes('Version one')));
  assert.equal((await admin.request(`/api/admin/pages/${id}`, 'DELETE', { revision: moved.page.revision })).status, 200);
  assert.equal((await reader.request('/api/page?path=archive%2Frenamed.md')).status, 404);
  assert.equal((await admin.request(`/api/admin/pages/${id}/history`)).status, 200);
  assert.equal((await (await admin.request('/api/admin/pages')).json() as PageRecord[]).find(page => page.id === id)!.deleted, true);
  const home = await (await reader.request('/api/page')).json() as PageResponse;
  assert.equal((await admin.request(`/api/admin/pages/${home.id}`, 'DELETE', { revision: home.revision })).status, 400);
  assert.equal((await admin.request('/api/admin/pages', 'POST', { path: '../escape.md', content: 'Bad' })).status, 400);

  await admin.service.close();
  admin.server.closeAllConnections(); await new Promise<void>(resolve => admin.server.close(() => resolve()));
  assert.equal((await reader.request('/api/page')).status, 200);
  const restarted = await f.start('admin');
  assert.equal((await (await restarted.request(`/api/admin/pages/${id}/history`)).json() as HistoryEntry[]).length, 4);
});

test('public SSE updates after Save without exposing draft data', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const reader = await f.start('public');
  const abort = new AbortController(); t.after(() => abort.abort());
  const response = await fetch(reader.url + '/api/events', { signal: abort.signal });
  assert.match(response.headers.get('content-type') || '', /^text\/event-stream/);
  const stream = response.body!.getReader();
  const decoder = new TextDecoder();
  await stream.read();
  const page = await (await reader.request('/api/page')).json() as PageResponse;
  const result = await admin.request(`/api/admin/pages/${page.id}`, 'PUT', { revision: page.revision, content: '# Changed live\n\n## New heading\nLive content.' });
  assert.equal(result.status, 200);
  const timeout = setTimeout(() => abort.abort(), 5000);
  let data = '';
  try {
    while (!data.includes('event: publication')) {
      const chunk = await stream.read();
      if (chunk.done) break;
      data += decoder.decode(chunk.value);
    }
    assert.match(data, /event: publication/);
  } finally { clearTimeout(timeout); await stream.cancel(); }
  const updated = await (await reader.request('/api/page')).json() as PageResponse;
  assert.equal(updated.title, 'Changed live');
  assert.equal(updated.headings[0]!.text, 'New heading');
});

test('failed commits preserve the previous publication and allow a later retry', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const wiki = admin.service.wiki!;
  const page = wiki.pages.find(page => page.path === 'home.md')!;
  const original = wiki.repository.commit.bind(wiki.repository);
  wiki.repository.commit = async () => { throw new Error('Simulated commit failure'); };
  const failed = await admin.request(`/api/admin/pages/${page.id}`, 'PUT', { revision: page.revision, content: '# Must not publish' });
  assert.equal(failed.status, 503);
  assert.match(await fs.readFile(path.join(f.config.contentDir, 'home.md'), 'utf8'), /Welcome/);
  assert.equal((await (await admin.request('/api/page')).json() as PageResponse).title, 'Welcome');
  wiki.repository.commit = original;
  assert.equal((await admin.request(`/api/admin/pages/${page.id}`, 'PUT', { revision: page.revision, content: '# Recovered' })).status, 200);
});

test('external edits are preserved and rejected instead of silently overwritten', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const home = admin.service.wiki!.pages.find(page => page.path === 'home.md')!;
  await fs.writeFile(path.join(f.config.contentDir, 'home.md'), '# External edit');
  const response = await admin.request(`/api/admin/pages/${home.id}`, 'PUT', { revision: home.revision, content: '# Browser edit' });
  assert.equal(response.status, 503);
  assert.equal(await fs.readFile(path.join(f.config.contentDir, 'home.md'), 'utf8'), '# External edit');
});

test('a committed transaction interrupted before publication is completed on restart', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  const before = structuredClone(wiki.pages);
  const after = structuredClone(before);
  const page = after.find(page => page.path === 'home.md')!;
  page.content = '# Recovered publication'; page.revision = randomUUID();
  await fs.writeFile(path.join(f.config.stateDir, 'transaction.json'), JSON.stringify({ beforeHead: await wiki.repository.head(), before, after, message: 'Interrupted save' }));
  await wiki.repository.writePages(after);
  await wiki.repository.commit('Interrupted save');
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Welcome');
  await admin.service.close();
  admin.server.closeAllConnections(); await new Promise<void>(resolve => admin.server.close(() => resolve()));
  await f.start('admin');
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Recovered publication');
  assert.equal(await fs.readFile(path.join(f.config.contentDir, 'home.md'), 'utf8'), '# Recovered publication');
});
