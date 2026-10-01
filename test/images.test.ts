import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MarkdownRenderer, relocateLinks } from '../apps/server/src/domain/markdown';
import { ImageIndex, wikiImages } from '../apps/server/src/domain/wiki-images';
import { ImageFiles } from '../apps/server/src/infrastructure/image-files';
import { createTranslator } from '../packages/i18n';
import type { HistoryEntry, MutationResult, PageResponse } from '../packages/contracts';
import { fixture } from './helpers';

const renderer = new MarkdownRenderer(createTranslator(), '/codex');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

test('Obsidian images resolve recursively, preserve dimensions and flag duplicate or missing names', () => {
  const index = new ImageIndex(['art/earthblood.png', 'one/portrait.png', 'two/portrait.png', 'portrait.png', 'places/Café coast.png']);
  const result = renderer.render('# Images\n\n![[earthblood.png|400x200]]\n\n![[portrait.png]] ![[absent.png]]\n\n![[two/portrait.png]] ![[./portrait.png]]\n\n![[places/Caf%C3%A9%20coast.png]]', 'notes/page.md', index);
  assert.match(result.html, /src="\/codex\/media\/_images\/art\/earthblood.png"/);
  assert.match(result.html, /width="400" height="200"/);
  assert.match(result.html, /data-image-index="1".*Multiple images match/);
  assert.match(result.html, /data-image-index="2".*Image not found/);
  assert.match(result.html, /src="\/codex\/media\/_images\/two\/portrait.png"/);
  assert.match(result.html, /src="\/codex\/media\/_images\/portrait.png"/);
  assert.match(result.html, /src="\/codex\/media\/_images\/places\/Caf%C3%A9%20coast.png"/);
  assert.doesNotMatch(result.html, /<button|codex-image:/);
});

test('image references in code and escaped examples remain literal, including when a note moves', () => {
  const source = '# Images\r\n\r\n`![[code.png]]`\r\n\r\n```md\r\n![[fenced.png]]\r\n```\r\n\r\n\\![[escaped.png]]\r\n\r\n![[art.png]] ![[art.png|300]]\r\n\r\n[Guide](other.md)\r\n';
  const embeds = wikiImages(source);
  assert.deepEqual(embeds.map(image => image.reference), ['art.png', 'art.png']);
  assert.equal(source.slice(embeds[1]!.start, embeds[1]!.end), '![[art.png|300]]');
  const moved = relocateLinks(source, 'notes/page.md', 'archive/deep/page.md');
  assert.match(moved, /!\[\[art.png\]\] !\[\[art.png\|300\]\]/);
  assert.match(moved, /\.\.\/\.\.\/notes\/other.md/);
  assert.equal(wikiImages(moved).length, 2);
  const rendered = renderer.render(source, 'notes/page.md', new ImageIndex(['art.png']));
  assert.equal((rendered.html.match(/<img /g) || []).length, 2);
  assert.match(rendered.html, /<code>!\[\[code.png\]\]<\/code>/);
});

test('image lookup rejects traversal and does not use note-adjacent paths', () => {
  const images = new ImageIndex(['a.png', 'nested/b.png']);
  for (const name of ['../a.png', '/a.png', 'nested/../a.png', 'C:\\a.png', '%2e%2e/a.png']) assert.equal(images.resolve(name).reason, 'missing');
  assert.equal(images.resolve('b.png').path, 'nested/b.png');
});

test('repair updates only the selected embed, commits history and publishes to readers', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const root = path.join(f.config.contentDir, '_images');
  await fs.mkdir(path.join(root, 'nested'), { recursive: true });
  await fs.writeFile(path.join(root, 'portrait.png'), 'root image');
  await fs.writeFile(path.join(root, 'nested', 'portrait.png'), 'nested image');
  const source = '# Test\r\n\r\n![[portrait.png]] and ![[portrait.png|320]]\r\n\r\n`![[portrait.png]]`\r\n';
  await fs.writeFile(path.join(f.config.contentDir, 'home.md'), source);
  const admin = await f.start('admin');
  const reader = await f.start('public');
  const page = await (await reader.request('/api/page')).json() as PageResponse;
  assert.match(page.html, /data-image-index="1"/);
  const endpoint = `/api/admin/pages/${page.id}/images`;
  assert.equal((await reader.request(endpoint, 'POST', {})).status, 404);
  assert.equal((await admin.request(endpoint, 'POST', { revision: page.revision, occurrence: 1, path: '../portrait.png', name: 'portrait.png', sha256: digest('root image') })).status, 400);
  assert.equal((await admin.request(endpoint, 'POST', { revision: page.revision, occurrence: 1, path: 'nested/portrait.png', name: 'portrait.png', sha256: digest('wrong file') })).status, 400);
  const response = await admin.request(endpoint, 'POST', { revision: page.revision, occurrence: 1, path: 'nested/portrait.png', name: 'portrait.png', sha256: digest('nested image') });
  assert.equal(response.status, 200);
  const repaired = await response.json() as MutationResult;
  assert.equal(repaired.page.content, source.replace('![[portrait.png|320]]', '![[nested/portrait.png|320]]'));
  assert.equal(await fs.readFile(path.join(f.config.contentDir, 'home.md'), 'utf8'), repaired.page.content);
  assert.match((await (await reader.request('/api/page')).json() as PageResponse).html, /data-image-index="1"/);
  await admin.service.wiki!.publish(page.id, { revision: repaired.page.revision });
  const published = await (await reader.request('/api/page')).json() as PageResponse;
  assert.match(published.html, /data-image-index="0"/);
  assert.doesNotMatch(published.html, /data-image-index="1"/);
  assert.match(published.html, /src="\/media\/_images\/nested\/portrait.png"/);
  assert.equal((await reader.request('/media/_images/nested/portrait.png')).status, 200);
  const history = await (await admin.request(`/api/admin/pages/${page.id}/history`)).json() as HistoryEntry[];
  assert.equal(history.length, 2);
  assert.match(history[0]!.message, /Resolve image/);
  assert.equal((await admin.request(endpoint, 'POST', { revision: page.revision, occurrence: 0, name: 'portrait.png', sha256: digest('root image') })).status, 409);
  const fallback = await admin.request(endpoint, 'POST', { revision: repaired.page.revision, occurrence: 0, name: 'portrait.png', sha256: digest('root image') });
  assert.equal(fallback.status, 200);
  assert.match(((await fallback.json()) as MutationResult).page.content, /!\[\[\.\/portrait.png\]\]/);
});

test('native picker fallback matches file content and refuses indistinguishable paths', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const root = path.join(f.config.contentDir, '_images');
  await fs.mkdir(path.join(root, 'nested'), { recursive: true });
  await fs.writeFile(path.join(root, 'same.png'), 'same bytes');
  await fs.writeFile(path.join(root, 'nested', 'same.png'), 'same bytes');
  const images = new ImageFiles(f.config.contentDir);
  await assert.rejects(images.selected({ name: 'same.png', sha256: digest('same bytes') }), { code: 'error.imageSelectionAmbiguous' });
  assert.equal(await images.selected({ path: 'nested/same.png', name: 'same.png', sha256: digest('same bytes') }), 'nested/same.png');
});

test('restarting admin resolves new assets in preview while preserving the public snapshot', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await fs.writeFile(path.join(f.config.contentDir, 'home.md'), '# Images\n\n![[later.png]]');
  const admin = await f.start('admin');
  const reader = await f.start('public');
  const before = await (await reader.request('/api/page')).json() as PageResponse;
  assert.match(before.html, /data-image-index/);
  await admin.service.close();
  await fs.mkdir(path.join(f.config.contentDir, '_images'));
  await fs.writeFile(path.join(f.config.contentDir, '_images', 'later.png'), 'later image');
  const restarted = await f.start('admin');
  const after = await (await restarted.request('/api/page')).json() as PageResponse;
  assert.equal((await (await reader.request('/api/page')).json() as PageResponse).html, before.html);
  assert.equal(after.revision, before.revision);
  assert.notEqual(after.publication, before.publication);
  assert.doesNotMatch(after.html, /data-image-index/);
  assert.match(after.html, /src="\/media\/_images\/later.png"/);
  await restarted.service.wiki!.publish(after.id, { revision: after.revision });
  assert.doesNotMatch((await (await reader.request('/api/page')).json() as PageResponse).html, /data-image-index/);
});
