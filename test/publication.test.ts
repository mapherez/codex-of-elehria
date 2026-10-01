import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MutationResult, PageResponse, Publication } from '../packages/contracts';
import { Publisher, publicationPath } from '../apps/server/src/services/publication';
import { fixture } from './helpers';

test('new collections and new pages stay private until each page is published', async t => {
  const f = await fixture({ publishInitial: false }); t.after(f.cleanup);
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const preview = await (await admin.request('/api/page')).json() as PageResponse;
  assert.equal(preview.publicationStatus, 'draft');
  assert.equal((await publicApp.request('/api/page')).status, 404);
  assert.equal((await (await publicApp.request('/api/navigation')).json()).count, 0);
  const created = await (await admin.request('/api/admin/pages', 'POST', { path: 'secret/Research.md', content: '# Private research\n\nUnreleased material.' })).json() as MutationResult;
  assert.equal((await admin.request('/api/page?path=secret/Research.md')).status, 200);
  assert.equal((await publicApp.request('/api/page?path=secret/Research.md')).status, 404);
  assert.equal((await publicApp.request(`/api/admin/pages/${created.page.id}/publish`, 'POST', { revision: created.page.revision })).status, 404);
  assert.equal((await publicApp.request('/media/secret/Research.md')).status, 404);
  const output = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  assert.doesNotMatch(output, /Private research|Unreleased material|secret/);
  assert.equal((await admin.request(`/api/admin/pages/${created.page.id}/publish`, 'POST', { revision: created.page.revision })).status, 200);
  const published = await (await publicApp.request('/api/page?path=secret/Research.md')).json() as PageResponse;
  assert.equal(published.title, 'Private research');
  assert.equal(published.publicationStatus, undefined);
  assert.equal((await publicApp.request('/api/page')).status, 404);
  assert.equal((await (await publicApp.request('/api/navigation')).json()).count, 1);
});

test('Save, restart and publishing another page never expose pending edits', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const original = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  const saved = await wiki.save(home.id, { revision: home.revision, content: '# Draft version two' });
  assert.equal(await fs.readFile(publicationPath(f.config.contentDir), 'utf8'), original);
  const preview = await (await admin.request('/api/page')).json() as PageResponse;
  assert.equal(preview.title, 'Draft version two'); assert.equal(preview.publicationStatus, 'changes');
  const other = await wiki.create({ path: 'Other.md', content: '# Other page' });
  await wiki.publish(other.page.id, { revision: other.page.revision });
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Welcome');
  await admin.service.close();
  const restarted = await f.start('admin');
  assert.equal((await (await restarted.request('/api/page')).json() as PageResponse).title, 'Draft version two');
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Welcome');
  const newer = await restarted.service.wiki!.save(home.id, { revision: saved.page.revision, content: '# Draft version three' });
  assert.equal((await restarted.request(`/api/admin/pages/${home.id}/publish`, 'POST', { revision: saved.page.revision })).status, 409);
  assert.equal((await restarted.request(`/api/admin/pages/${home.id}/publish`, 'POST', { revision: newer.page.revision })).status, 200);
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Draft version three');
  assert.equal((await (await restarted.request('/api/page')).json() as PageResponse).publicationStatus, 'published');
  const head = await restarted.service.wiki!.repository.head();
  const snapshot = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  const duplicate = await restarted.request(`/api/admin/pages/${home.id}/publish`, 'POST', { revision: newer.page.revision });
  assert.equal((await duplicate.json() as MutationResult).unchanged, true);
  assert.equal(await restarted.service.wiki!.repository.head(), head);
  assert.equal(await fs.readFile(publicationPath(f.config.contentDir), 'utf8'), snapshot);
});

test('public links and navigation use only released paths and released headings', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  const target = await wiki.create({ path: 'hidden/Target.md', content: '# Target\n\n## Original section' });
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const saved = await wiki.save(home.id, { revision: home.revision, content: '# Home\n\n[[Target#Original section|Wiki target]] [Markdown target](hidden/Target.md)' });
  await wiki.publish(home.id, { revision: saved.page.revision });
  const read = async () => (await (await publicApp.request('/api/page')).json()) as PageResponse;
  assert.doesNotMatch((await read()).html, /<a[^>]+href="\/wiki\/hidden\/Target/);
  assert.match((await (await admin.request('/api/page')).json() as PageResponse).html, /href="\/wiki\/hidden\/Target/);
  await wiki.publish(target.page.id, { revision: target.page.revision });
  assert.match((await read()).html, /href="\/wiki\/hidden\/Target#original-section"/);
  const moved = await wiki.move(target.page.id, { revision: target.page.revision, path: 'new/Target.md' });
  const edited = await wiki.save(target.page.id, { revision: moved.page.revision, content: '# New title\n\n## New section' });
  assert.match((await read()).html, /href="\/wiki\/hidden\/Target#original-section"/);
  assert.equal((await publicApp.request('/api/page?path=new/Target.md')).status, 404);
  const navigation = JSON.stringify(await (await publicApp.request('/api/navigation')).json());
  assert.match(navigation, /hidden\/Target.md/); assert.doesNotMatch(navigation, /new\/Target.md/);
  await wiki.publish(target.page.id, { revision: edited.page.revision });
  assert.equal((await publicApp.request('/wiki/hidden/Target')).headers.get('location'), '/wiki/new/Target');
  assert.match((await read()).html, /Heading not found/);
  await wiki.delete(target.page.id, { revision: edited.page.revision });
  assert.equal((await publicApp.request('/api/page?path=new/Target.md')).status, 404);
});

test('migration preserves the exact legacy snapshot even when Git has newer content', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const before = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  const home = admin.service.wiki!.pages.find(page => page.path === 'home.md')!;
  await admin.service.wiki!.save(home.id, { revision: home.revision, content: '# Later private edit' });
  await admin.service.close();
  // A pre-Publish installation has the public snapshot and Git, but no release index.
  await fs.rm(path.join(f.config.stateDir, 'published.json'));
  const migrated = await f.start('admin');
  assert.equal(await fs.readFile(publicationPath(f.config.contentDir), 'utf8'), before);
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Welcome');
  const preview = await (await migrated.request('/api/page')).json() as PageResponse;
  assert.equal(preview.title, 'Later private edit'); assert.equal(preview.publicationStatus, 'changes');
});

test('interrupted Publish replays its recorded snapshot, never a later draft', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const saved = await wiki.save(home.id, { revision: home.revision, content: '# Approved version' });
  const originalWrite = Publisher.prototype.write;
  t.after(() => { Publisher.prototype.write = originalWrite; });
  Publisher.prototype.write = async function(snapshot: Publication) {
    if (snapshot.pages.some(page => page.title === 'Approved version')) throw new Error('Simulated snapshot delivery failure');
    return originalWrite.call(this, snapshot);
  };
  const failed = await admin.request(`/api/admin/pages/${home.id}/publish`, 'POST', { revision: saved.page.revision });
  assert.equal(failed.status, 503);
  assert.equal((await failed.json()).error.code, 'error.publishPending');
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Welcome');
  Publisher.prototype.write = originalWrite;
  await wiki.save(home.id, { revision: saved.page.revision, content: '# Later draft' });
  await admin.service.close();
  const restarted = await f.start('admin');
  assert.equal((await (await publicApp.request('/api/page')).json() as PageResponse).title, 'Approved version');
  assert.equal((await (await restarted.request('/api/page')).json() as PageResponse).title, 'Later draft');
});

test('a draft cannot replace another page still published at the same path', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const wiki = admin.service.wiki!;
  const first = wiki.pages.find(page => page.path === 'guides/first.md')!;
  await wiki.move(first.id, { revision: first.revision, path: 'archive/first.md' });
  const replacement = await wiki.create({ path: 'guides/first.md', content: '# Replacement' });
  await assert.rejects(wiki.publish(replacement.page.id, { revision: replacement.page.revision }), { code: 'error.publishedPath' });
});
