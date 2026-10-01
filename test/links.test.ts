import test from 'node:test';
import assert from 'node:assert/strict';
import { MarkdownRenderer, relocateLinks } from '../apps/server/src/domain/markdown';
import { createTranslator } from '../packages/i18n';
import { fixture } from './helpers';
import type { PageResponse } from '../packages/contracts';

const renderer = new MarkdownRenderer(createTranslator(), '/library');
const note = (path: string, content: string, aliases: string[] = []) => ({ path, content, aliases, deleted: false });
const humans = note('races/Humans.md', '# Humans\n\n## Culture\n\n### Café & customs\n\n## Culture');

test('wikilinks resolve names, aliases, explicit paths, and actual heading anchors', () => {
  const content = '[[Humans]] [[Humans.md|Humanity]] [[races/Humans#Culture]] [[Humans#Café & customs|Customs]] [[#Local]] [[home]]';
  const source = '# Home\n\n## Local\n' + content;
  const notes = renderer.noteIndex([humans, note('home.md', source)]);
  const { html } = renderer.render(source, 'home.md', undefined, notes);
  assert.match(html, /href="\/library\/wiki\/races\/Humans"[^>]*>Humans<\/a>/);
  assert.match(html, />Humanity<\/a>/);
  assert.match(html, /href="\/library\/wiki\/races\/Humans#culture"/);
  assert.match(html, /href="\/library\/wiki\/races\/Humans#cafe-customs"[^>]*>Customs<\/a>/);
  assert.match(html, /href="\/library\/#local"/);
  assert.match(html, /href="\/library\/"[^>]*>home<\/a>/);
  assert.doesNotMatch(html, /data-note-warning/);
});

test('missing, duplicate and missing-heading targets stay inert with localized hidden warnings', () => {
  const notes = renderer.noteIndex([humans, note('other/Humans.md', '# Other')]);
  const { html } = renderer.render('[[Humans|People]] [[Absent]] [[races/Humans#Absent|Section]] [[races/Humans]]', 'home.md', undefined, notes);
  assert.match(html, /People<span class="note-warning"[^>]*aria-label="Multiple notes match: Humans/);
  assert.match(html, /Absent<span[^>]*aria-label="Note not found: Absent/);
  assert.match(html, /Section<span[^>]*aria-label="Heading not found: races\/Humans#Absent/);
  assert.equal((html.match(/data-page-path=/g) || []).length, 1);
});

test('code, escaped links, note embeds, and block references are not converted', () => {
  const content = '`[[Humans]]`\n\n```md\n[[Humans]]\n```\n\n\\[[Humans]] ![[Humans]] [[Humans#^block]]\n\n[Label [[Humans]]](https://example.com)';
  const { html } = renderer.render(content, 'home.md', undefined, renderer.noteIndex([humans]));
  assert.doesNotMatch(html, /data-page-path|data-note-warning/);
  assert.match(html, /<code>\[\[Humans\]\]<\/code>/);
});

test('labels are escaped and heading IDs match the rendered wikilink labels', () => {
  const source = '# Home\n\n## [[Humans|Human culture]]\n\n[[#Human culture]] [[Humans|<img src=x onerror=alert(1)>]]';
  const { html } = renderer.render(source, 'home.md', undefined, renderer.noteIndex([humans, note('home.md', source)]));
  assert.match(html, /id="human-culture"/);
  assert.match(html, /href="\/library\/#human-culture"/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test('renames preserve wikilink syntax and resolve old names through page aliases', () => {
  const content = '[[Humans|Human culture]] [[races/Humans#Culture]]\n\n[Other](other.md)';
  const moved = relocateLinks(content, 'guides/a.md', 'archive/deep/a.md');
  assert.ok(moved.includes('[[Humans|Human culture]] [[races/Humans#Culture]]'));
  const notes = renderer.noteIndex([note('peoples/People.md', humans.content, ['races/Humans.md'])]);
  const { html } = renderer.render(moved, 'archive/deep/a.md', undefined, notes);
  assert.match(html, /href="\/library\/wiki\/peoples\/People#culture"/);
  assert.doesNotMatch(html, /data-note-warning/);
});

test('the note index and renderer share anchors for formatted headings and image embeds', () => {
  const content = '# Title\n\n## **Culture** & `customs`\n\n## ![[portrait.png|300]]\n\n## Culture\n\n## Culture';
  const indexed = note('Humans.md', content);
  const notes = renderer.noteIndex([indexed]);
  const headings = renderer.render(content, indexed.path).headings;
  for (const heading of headings) {
    const result = renderer.render(`[[Humans#${heading.id}|Section]]`, 'home.md', undefined, notes);
    assert.match(result.html, new RegExp('href="/library/wiki/Humans#' + heading.id + '"'));
    assert.doesNotMatch(result.html, /data-note-warning/);
  }
});

test('clean routes and legacy redirects work with prefixes, queries, direct requests and aliases', async t => {
  const f = await fixture(); t.after(f.cleanup);
  f.config.site.basePath = '/library';
  const admin = await f.start('admin');
  const publicApp = await f.start('public');
  assert.equal((await publicApp.request('/library/wiki/guides/first')).status, 200);
  const legacy = await publicApp.request('/library/wiki/guides/first.md?ref=test');
  assert.equal(legacy.status, 302);
  assert.equal(legacy.headers.get('location'), '/library/wiki/guides/first?ref=test');
  assert.equal((await publicApp.request('/library/wiki/home')).headers.get('location'), '/library/');
  const page = await (await publicApp.request('/library/api/page?path=guides/first.md')).json() as PageResponse;
  assert.equal((await admin.request(`/library/api/admin/pages/${page.id}/move`, 'POST', { revision: page.revision, path: 'archive/First note.md' })).status, 200);
  await admin.service.wiki!.publish(page.id, { revision: admin.service.wiki!.get(page.id).revision });
  assert.equal((await publicApp.request('/library/wiki/guides/first')).headers.get('location'), '/library/wiki/archive/First%20note');
  assert.equal((await publicApp.request('/library/wiki/archive/First%20note')).status, 200);
});

test('creating, updating and deleting a target re-resolves other notes without changing their Markdown', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const admin = await f.start('admin');
  const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const content = '# Home\n\n[[Humans#Culture|People]]';
  await wiki.save(home.id, { revision: home.revision, content });
  await wiki.publish(home.id, { revision: wiki.get(home.id).revision });
  const read = async () => (await (await publicApp.request('/api/page')).json()) as PageResponse;
  assert.match((await read()).html, /Note not found/);
  const created = await wiki.create({ path: humans.path, content: humans.content });
  await wiki.publish(created.page.id, { revision: created.page.revision });
  assert.match((await read()).html, /href="\/wiki\/races\/Humans#culture"/);
  const updated = await wiki.save(created.page.id, { revision: created.page.revision, content: '# Humans\n\n## Language' });
  await wiki.publish(updated.page.id, { revision: updated.page.revision });
  assert.match((await read()).html, /Heading not found/);
  await wiki.delete(updated.page.id, { revision: updated.page.revision });
  assert.match((await read()).html, /Note not found/);
  assert.equal(wiki.get(home.id).content, content);
});
