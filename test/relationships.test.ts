import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { Publication, RelationshipsResponse } from '../packages/contracts';
import { MarkdownRenderer } from '../apps/server/src/domain/markdown';
import { RelationshipIndex } from '../apps/server/src/domain/relationships';
import { createTranslator } from '../packages/i18n';
import { fixture } from './helpers';
import { publicationPath } from '../apps/server/src/services/publication';

const t = createTranslator(); const renderer = new MarkdownRenderer(t, '/library');
function snapshot(notes: { path: string; content: string; aliases?: string[] }[]): Publication {
  const input = notes.map(note => ({ ...note, aliases: note.aliases || [], deleted: false }));
  const targets = renderer.noteIndex(input);
  return { schema: 1, revision: 'unit', publishedAt: '', navigation: [], pages: input.map((note, i) => ({
    id: String(i), path: note.path, aliases: note.aliases, revision: String(i), ...renderer.render(note.content, note.path, undefined, targets)
  })) };
}

test('relationships group directed links and headings, resolve aliases, and exclude self links, assets, code and external links', () => {
  const publication = snapshot([
    { path: 'home.md', content: '# Home\n\n[[Humans]] [[Humans|People]] [[races/Humans#Culture]] [[Humans#Café & customs]] [Top](races/Humans.md#humans) [Culture](old/Humans.md#culture) [[home#Home]] [[#Home]] ![[picture.png]] [Website](https://example.com)\n\n~~~md\n[[Orphan]]\n~~~\n\n`[[Orphan]]`' },
    { path: 'races/Humans.md', aliases: ['old/Humans.md'], content: '# `Humans`\n\n## **Culture**\n\n### Café & `customs`\n\n[[home]] [[Missing]] [[home#Absent]]' },
    { path: 'Orphan.md', content: '# Orphan\nNo links.' }
  ]);
  const index = new RelationshipIndex(t);
  const graph = index.local(publication, 'home.md', true);
  assert.equal(index.nodes.size, 3); assert.equal(index.edges.size, 2);
  assert.deepEqual(graph.nodes.map(node => node.path), ['home.md', 'races/Humans.md']);
  const outward = graph.edges.find(edge => edge.sourceId === '0')!;
  assert.equal(outward.targetId, '1');
  assert.deepEqual(outward.destinations.map(destination => destination.fragment), ['', '#cafe-customs', '#culture', '#humans']);
  assert.equal(outward.destinations.find(destination => destination.fragment === '#cafe-customs')!.heading, 'Café & customs');
  assert.equal(outward.destinations.find(destination => destination.fragment === '#humans')!.heading, 'Humans');
  assert.equal(graph.nodes.find(node => node.id === '1')!.incoming, 1);
  const humans = index.local(publication, 'old/Humans.md', true);
  assert.equal(humans.centerId, '1');
  assert.deepEqual(humans.unresolved?.map(reference => reference.reason).sort(), ['headingMissing', 'missing']);
  assert.equal(humans.unresolved?.find(reference => reference.reason === 'headingMissing')?.targetId, '0');
  assert.equal('unresolved' in index.local(publication, 'races/Humans.md'), false);
  const orphan = index.local(publication, 'Orphan.md');
  assert.equal(orphan.nodes.length, 1); assert.equal(orphan.edges.length, 0);
});

test('ambiguous and missing targets remain unresolved without inventing links or self backlinks', () => {
  const publication = snapshot([
    { path: 'A.md', content: '# A\n[[Twin]] [[Absent]] [[A#Missing]] [Missing Markdown](Absent.md#section) [[one/Twin#Absent]] [[Twin]]' },
    { path: 'one/Twin.md', content: '# One' },
    { path: 'two/Twin.md', content: '# Two' }
  ]);
  const graph = new RelationshipIndex(t).local(publication, 'A.md', true);
  assert.equal(graph.edges.length, 0);
  assert.equal(graph.unresolved?.length, 4);
  assert.equal(graph.unresolved?.filter(item => item.reference === 'Twin').length, 1);
  assert.equal(graph.unresolved?.find(item => item.reference === 'Twin')?.reason, 'ambiguous');
  assert.deepEqual(graph.nodes.map(node => node.path), ['A.md', 'one/Twin.md']);
});

test('legacy HTML stays searchable as relationships without rewriting the stored snapshot', () => {
  const publication: Publication = { schema: 1, revision: 'legacy', publishedAt: '', navigation: [], pages: [
    { id: 'a', path: 'A.md', aliases: [], revision: 'a', title: 'A', headings: [], html: '<h1 id="a">A</h1><p><a data-page-path="old/B.md" data-page-suffix="#caf%C3%A9">B</a> Missing<span class="note-warning" aria-label="Note not found: Missing">!</span></p>' },
    { id: 'b', path: 'B.md', aliases: ['old/B.md'], revision: 'b', title: 'B', headings: [], html: '<h1 id="b">B</h1><h2 id="café">Café<a class="heading-anchor">#</a></h2>' }
  ] };
  const before = JSON.stringify(publication); const index = new RelationshipIndex(t);
  const graph = index.local(publication, 'A.md', true);
  assert.equal(graph.edges[0]!.targetId, 'b');
  assert.equal(graph.edges[0]!.destinations[0]!.heading, 'Café');
  assert.equal(graph.unresolved?.[0]?.reference, 'Missing');
  assert.equal(JSON.stringify(publication), before);
  const updated = structuredClone(publication); updated.revision = 'next'; updated.pages[1]!.html = '<h1 id="b">B</h1>';
  assert.equal(index.local(updated, 'A.md', true).edges.length, 0);
  assert.equal(index.local(updated, 'A.md', true).unresolved?.find(item => item.reason === 'headingMissing')?.targetId, 'b');
});

test('the full index keeps isolated nodes and returns hundreds of direct neighbours without truncation or second-level expansion', () => {
  const publication = snapshot([
    { path: 'Hub.md', content: '# Hub\n'+Array.from({length:350},(_,i)=>'[[Note '+i+']]').join(' ') },
    ...Array.from({length:350},(_,i)=>({path:'Note '+i+'.md',content:'# Note '+i+'\n[[Far]]'})),
    { path: 'Far.md', content: '# Far' }, { path: 'Alone.md', content: '# Alone' }
  ]);
  const index = new RelationshipIndex(t); const graph = index.local(publication, 'Hub.md');
  assert.equal(graph.nodes.length, 351); assert.equal(graph.edges.length, 350);
  assert.equal(graph.nodes.some(node => node.path === 'Far.md'), false);
  assert.equal(index.nodes.size, 353);
  assert.equal(index.local(publication, 'Far.md').nodes.length, 351);
});

test('relationship APIs use released snapshots publicly, current drafts privately, prefixes and aliases, and update after Save and Publish', async test => {
  const f = await fixture(); test.after(f.cleanup); f.config.site.basePath = '/library';
  const admin = await f.start('admin'); const publicApp = await f.start('public'); const wiki = admin.service.wiki!;
  async function graph(app: typeof admin, path: string) {
    const response = await app.request('/library/api/relationships?' + new URLSearchParams({path}));
    assert.equal(response.status, 200); return response.json() as Promise<RelationshipsResponse>;
  }
  const home = wiki.pages.find(page => page.path === 'home.md')!;
  const publicBefore = await fs.readFile(publicationPath(f.config.contentDir), 'utf8');
  const privatePage = await wiki.create({path:'Private.md',content:'# Private\n\n## Culture\nA draft.'});
  await wiki.save(home.id,{revision:home.revision,content:'# Home\n\n[[Private#Culture]] [[guides/first#A section]]'});
  const draft = await graph(admin,'home.md');
  assert.equal(draft.nodes.some(node=>node.id===privatePage.page.id),true);
  const before = await graph(publicApp,'home.md');
  assert.equal(before.nodes.some(node=>node.id===privatePage.page.id),false);
  assert.equal('unresolved' in before,false);
  assert.equal(await fs.readFile(publicationPath(f.config.contentDir),'utf8'),publicBefore);
  await wiki.publish(home.id,{revision:wiki.get(home.id).revision});
  const released = await graph(publicApp,'home.md');
  assert.equal(released.nodes.some(node=>node.id===privatePage.page.id),false);
  assert.equal(released.edges.filter(edge=>edge.sourceId===home.id).length,1);
  await wiki.publish(privatePage.page.id,{revision:privatePage.page.revision});
  assert.equal((await graph(publicApp,'home.md')).edges.filter(edge=>edge.sourceId===home.id).length,2);
  const first = wiki.pages.find(page=>page.path==='guides/first.md')!;
  await wiki.move(first.id,{path:'Elsewhere/First.md',revision:first.revision});
  assert.equal((await graph(admin,'guides/first.md')).centerId,first.id);
  assert.equal((await graph(admin,'home.md')).nodes.find(node=>node.id===first.id)!.path,'Elsewhere/First.md');
  assert.equal((await graph(publicApp,'home.md')).nodes.find(node=>node.id===first.id)!.path,'guides/first.md');
  await wiki.publish(first.id,{revision:wiki.get(first.id).revision});
  assert.equal((await graph(publicApp,'guides/first.md')).centerId,first.id);
  await wiki.delete(privatePage.page.id,{revision:wiki.get(privatePage.page.id).revision});
  assert.equal((await graph(publicApp,'home.md')).nodes.some(node=>node.id===privatePage.page.id),false);
  assert.equal((await graph(admin,'home.md')).unresolved?.some(item=>item.reference==='Private#Culture'),true);
  assert.equal((await publicApp.request('/library/api/relationships?path=Private.md')).status,404);
  assert.equal((await publicApp.request('/library/api/relationships?path=a&path=b')).status,400);
});
