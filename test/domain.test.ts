import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNavigation } from '../apps/server/src/domain/navigation';
import { validatePath } from '../apps/server/src/infrastructure/filesystem';
import { MarkdownRenderer, relocateLinks } from '../apps/server/src/domain/markdown';
import { createTranslator } from '../packages/i18n';
import { pageUrl, fileFromLocation } from '../packages/contracts/routes';
import { loadConfig } from '../apps/server/src/config';

const renderer = new MarkdownRenderer(createTranslator(), '/codex');

test('the shipped configuration starts with a valid local Git identity', async () => {
  const config = await loadConfig('admin');
  assert.equal(config.site.gitAuthor.email, 'wiki@localhost');
  assert.equal(config.messages['action.save'], 'Save');
});

test('navigation follows arbitrary folders and excludes only root home.md', () => {
  const tree = buildNavigation(['home.md', 'intro.md', 'world/home.md', 'world/deep/two.md', 'world/deep/one.md', 'other/z.md'], 'en');
  assert.deepEqual(tree.map(node => node.name), ['other', 'world', 'intro']);
  const world = tree[1]!;
  assert.equal(world.type, 'folder');
  if (world.type !== 'folder') return;
  assert.deepEqual(world.children.map(node => node.name), ['deep', 'home']);
  assert.equal(JSON.stringify(tree).includes('"name":"dist"'), false);
});

test('headings have unique anchors, Unicode support and a nested table of contents', () => {
  const result = renderer.render('# Title\n\n## Repeated\n\n### Repeated\n\n## Repeated-1\n\n## Café\n', 'guides/a.md');
  assert.deepEqual(result.headings.map(h => h.id), ['repeated', 'repeated-1', 'repeated-1-1', 'cafe']);
  assert.deepEqual(result.headings.map(h => h.level), [2, 3, 2, 2]);
  assert.equal(result.title, 'Title');
  assert.match(result.html, /aria-label="Link to Café"/);
});

test('Markdown links, references, images and unsafe HTML are rendered safely', () => {
  const result = renderer.render('[Page](../world/a%20b.md#section)\n\n[Home][h]\n\n[h]: /home.md\n\n![Image](images/a.png)\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))', 'guides/one.md');
  assert.match(result.html, /href="\/codex\/wiki\/world\/a%20b.md#section"/);
  assert.match(result.html, /href="\/codex\/"/);
  assert.match(result.html, /src="\/codex\/media\/guides\/images\/a.png"/);
  assert.doesNotMatch(result.html, /<script>|href="javascript:/);
});

test('moving Markdown preserves link destinations and never rewrites code examples', () => {
  const before = '[Other](other.md#part)\n\n[Reference][ref]\n\n[ref]: ../home.md\n\n`[code](other.md)`\n\n![Image](images/a.png)';
  const after = relocateLinks(before, 'guides/first.md', 'archive/deep/first.md');
  assert.match(after, /\.\.\/\.\.\/guides\/other.md#part/);
  assert.match(after, /\.\.\/\.\.\/home.md/);
  assert.match(after, /`\[code\]\(other.md\)`/);
  assert.match(after, /\.\.\/\.\.\/guides\/images\/a.png/);
});

test('file access rejects traversal and reserved paths', () => {
  for (const path of ['../secret.md', '/a.md', 'a/../secret.md', '.git/config.md', 'a\\b.md', 'NUL.md', 'a/.hidden.md', 'a.md ', 'a:bad.md']) assert.throws(() => validatePath(path));
  assert.equal(validatePath('World/Café notes.md'), 'World/Café notes.md');
  assert.equal(pageUrl('World/Café notes.md', '/library'), '/library/wiki/World/Caf%C3%A9%20notes.md');
  assert.equal(fileFromLocation('/library/wiki/World/Caf%C3%A9%20notes.md', '/library'), 'World/Café notes.md');
});
