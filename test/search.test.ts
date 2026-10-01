import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createTranslator } from '../packages/i18n';
import type { Publication, SearchResponse } from '../packages/contracts';
import { MarkdownRenderer } from '../apps/server/src/domain/markdown';
import { SearchIndex, prepareSearchHtml } from '../apps/server/src/domain/search';
import { publicationPath } from '../apps/server/src/services/publication';
import { fixture } from './helpers';

const t = createTranslator();
const renderer = new MarkdownRenderer(t, '');
function collection(notes: { path: string; content: string }[]): Publication {
  const input = notes.map(note => ({ ...note, aliases: [], deleted: false }));
  const links = renderer.noteIndex(input);
  return { schema: 1, revision: 'unit-revision', publishedAt: '', navigation: [], pages: input.map((note, index) => ({
    ...renderer.render(note.content, note.path, undefined, links), id: String(index), path: note.path, revision: String(index), aliases: []
  })) };
}

test('search folds accents and case, requires all words, and ranks exact expressions first', () => {
  const index = new SearchIndex(t);
  const publication = collection([
    { path: 'A.md', content: '# A\n\nAn ancient civilization.\n\nA creature arrived.' },
    { path: 'Z.md', content: '# Z\n\nThe ancient creature built a Façade near Güt.\n\nHumános flourished.' },
    { path: 'Incomplete.md', content: '# Incomplete\n\nOnly an ancient civilization.' }
  ]);
  const result = index.search(publication, 'ANCIENT creature');
  assert.deepEqual(result.results.map(page => page.path), ['Z.md', 'A.md']);
  for (const query of ['facade', 'gut', 'humanos', 'HUMÁNOS']) {
    const found = index.search(publication, query);
    assert.equal(found.total, 1);
    assert.equal(found.results[0]!.path, 'Z.md');
    assert.ok(found.results[0]!.snippet.some(segment => segment.match));
  }
  const fragment = index.search(publication, 'gut').results[0]!.fragment;
  assert.match(fragment, /^#search-s\d+~\d+~\d+$/);
});

test('search finds hidden note destinations and visible aliases while excluding filenames and image references', () => {
  const index = new SearchIndex(t);
  const publication = collection([
    { path: 'FileNameOnly.md', content: 'Unrelated prose. ![[ImageNameOnly.png]]\n\n![AltNameOnly](AttachmentNameOnly.png)' },
    { path: 'Links.md', content: '# Links\n\nA [[HIDDEN_CREATURE|gentle creature]] arrived.\n\n[[UnknownTarget|missing alias]]\n\n- tight list\n  - nested treasure\n\n| Value |\n| --- |\n| precious metal |\n\n~~~ts\nconst executable = true;\n~~~' },
    { path: 'HIDDEN_CREATURE.md', content: '# Animals\n\nOther prose.' }
  ]);
  for (const query of ['FileNameOnly', 'ImageNameOnly', 'AltNameOnly', 'AttachmentNameOnly']) assert.equal(index.search(publication, query).total, 0);
  for (const query of ['HIDDEN_CREATURE', 'gentle creature', 'UnknownTarget', 'nested treasure', 'precious metal', 'executable']) {
    const result = index.search(publication, query);
    assert.equal(result.total, 1, query);
    assert.equal(result.results[0]!.path, 'Links.md', query);
  }
  const alias = index.search(publication, 'HIDDEN_CREATURE').results[0]!;
  assert.ok(alias.snippet.some(segment => segment.match && segment.text === 'gentle creature'));
  const prepared = prepareSearchHtml(publication.pages[1]!.html, t);
  assert.match(prepared.html, /data-search-block="s\d+"/);
  const block = prepared.blocks.find(block => block.references.some(reference => reference.value === 'HIDDEN_CREATURE'))!;
  const reference = block.references.find(reference => reference.value === 'HIDDEN_CREATURE')!;
  assert.equal(block.text.slice(reference.start, reference.end), 'gentle creature');
});

test('old published HTML is searchable without importing current files or changing its snapshot', () => {
  const index = new SearchIndex(t);
  const publication: Publication = { schema: 1, revision: 'legacy', publishedAt: '', navigation: [], pages: [{
    id: 'old', path: 'FilenameOnly.md', aliases: [], revision: 'old-page', title: 'FilenameOnly', headings: [],
    html: '<h1>FilenameOnly</h1><p>An <a href="/wiki/HiddenName" data-page-path="HiddenName.md">alias</a> and absent<span class="note-warning" data-note-warning aria-label="Note not found: MissingName">!</span>.</p>'
  }] };
  assert.equal(index.search(publication, 'FilenameOnly').total, 0);
  assert.equal(index.search(publication, 'HiddenName').total, 1);
  assert.equal(index.search(publication, 'MissingName').total, 1);
  assert.equal(publication.pages[0]!.html.includes('data-search-block'), false);
});

test('search paging returns the full matching set without duplicate rows or unescaped snippet HTML', () => {
  const index = new SearchIndex(t);
  const publication = collection(Array.from({ length: 23 }, (_, i) => ({ path: i + '.md', content: 'The shared word.\n\n<script>unsafe</script>' })));
  const first = index.search(publication, 'shared');
  const second = index.search(publication, 'shared', 10, 10);
  const third = index.search(publication, 'shared', 20, 10);
  assert.equal(first.results.length, 10); assert.equal(first.total, 23);
  assert.equal(new Set([...first.results, ...second.results, ...third.results].map(result => result.id)).size, 23);
  assert.equal(index.search(publication, '   ').total, 0);
  const literal = index.search(publication, 'unsafe').results[0]!;
  assert.ok(literal.snippet.some(segment => segment.text.includes('<script>')));
  assert.equal(literal.snippet.some(segment => segment.match && segment.text === 'unsafe'), true);
});

test('Public searches exact published versions while Admin searches saved drafts and refreshes after mutations', async t => {
  const f = await fixture(); t.after(f.cleanup);
  f.config.site.basePath = '/knowledge';
  const admin = await f.start('admin'); const publicApp = await f.start('public');
  const wiki = admin.service.wiki!;
  async function search(app: typeof admin, query: string) {
    const response = await app.request('/knowledge/api/search?' + new URLSearchParams({ q: query }));
    assert.equal(response.status, 200); return response.json() as Promise<SearchResponse>;
  }
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const publicSnapshot = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  const draft = await wiki.save(home.id, { revision: home.revision, content: '# Private draft\n\nDraftwordonly.' });
  assert.equal((await search(admin, 'draftwordonly')).total, 1);
  assert.equal((await search(publicApp, 'draftwordonly')).total, 0);
  assert.equal((await search(publicApp, 'A home page')).total, 1);
  assert.equal((await search(admin, 'A home page')).total, 0);
  assert.equal(await fs.readFile(publicationPath(f.config.contentDir), 'utf8'), publicSnapshot);
  const created = await wiki.create({ path: 'nested/New.md', content: '# New\n\nNewwordonly.' });
  assert.equal((await search(admin, 'Newwordonly')).total, 1);
  assert.equal((await search(publicApp, 'Newwordonly')).total, 0);
  await wiki.publish(home.id, { revision: draft.page.revision });
  assert.equal((await search(publicApp, 'draftwordonly')).total, 1);
  assert.equal((await search(publicApp, 'A home page')).total, 0);
  const result = (await search(admin, 'Newwordonly')).results[0]!;
  const page = await (await admin.request('/knowledge/api/page?path=nested%2FNew.md')).json();
  assert.ok(page.html.includes('data-search-block="' + result.fragment.split('~')[0]!.replace('#search-', '') + '"'));
  await wiki.move(created.page.id, { path: 'moved/New.md', revision: created.page.revision });
  assert.equal((await search(admin, 'Newwordonly')).results[0]!.path, 'moved/New.md');
  await wiki.delete(created.page.id, { revision: wiki.get(created.page.id).revision });
  assert.equal((await search(admin, 'Newwordonly')).total, 0);
  assert.equal((await publicApp.request('/knowledge/api/search?limit=101')).status, 400);
  assert.equal((await publicApp.request('/knowledge/api/search?offset=-1')).status, 400);
  assert.equal((await publicApp.request('/knowledge/api/search?q=a&q=b')).status, 400);
  assert.equal((await publicApp.request('/knowledge/api/search?q=' + 'x'.repeat(301))).status, 400);
  assert.equal((await publicApp.request('/knowledge/search?q=draftwordonly')).status, 200);
  assert.equal((await publicApp.request('/knowledge/api/admin/pages')).status, 404);
});
