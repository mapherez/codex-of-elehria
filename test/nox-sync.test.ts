import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeNox } from './nox-helper';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fixture } from './helpers';
import type { NoxSync } from '../apps/server/src/services/nox-sync';


async function ready(nox: NoxSync, id: string) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const job = nox.job(id);
    if (job.state !== 'preparing') return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Import preparation timed out');
}
async function json<T>(response: Response): Promise<T> { assert.equal(response.ok, true, await response.clone().text()); return response.json() as Promise<T>; }

test('NoX imports remain private, preserve original Markdown, and publish immutable image versions', async () => {
  const f = await fixture(); const remote = await fakeNox();
  try {
    remote.put('World/Humans.md', '# Humans\n\n![[art.png|300x200]]\n\n![Portrait](<../Attachments/art & é.png>)\n\n[[Humans#Culture|Culture]]\n\n## Culture\nOriginal.\n');
    remote.put('World/Other.md', '# Other\n\n![[art.png]]\n');
    remote.put('Attachments/art.png', Buffer.from('first-image'));
    remote.put('Attachments/art & é.png', Buffer.from('second-portrait'));
    const admin = await f.start('admin'); const publicApp = await f.start('public'); const nox = admin.service.nox!;
    const connection = await json<{ settings: { hasKey: boolean } }>(await admin.request('/api/admin/nox/connection', 'PUT', { url: remote.url, apiKey: 'test-private-key' }));
    assert.equal(connection.settings.hasKey, true);
    assert.equal(JSON.stringify(connection).includes('test-private-key'), false);
    assert.equal((await publicApp.request('/api/admin/nox/connection')).status, 404);
    const listing = await nox.list('vault-id');
    let job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md', 'World/Other.md'] }).id);
    assert.equal(job.state, 'ready'); assert.deepEqual(job.reviews.map(review => review.status), ['new', 'new']);
    const beforeHead = await admin.service.wiki!.repository.head();
    job = await nox.apply(job.id, { decisions: {}, confirmReplace: false });
    assert.equal(job.result!.length, 2); assert.notEqual(await admin.service.wiki!.repository.head(), beforeHead);
    assert.equal((await admin.service.wiki!.repository.run('rev-list', '--count', beforeHead! + '..HEAD')).trim(), '1');
    const human = admin.service.wiki!.pages.find(page => page.path === 'World/Humans.md')!;
    assert.equal(human.content, remote.content.get('World/Humans.md')!.bytes.toString());
    const media = human.imageBindings!['w:art.png']!.path!;
    const preview = await json<{ html: string }>(await admin.request('/api/page?path=World%2FHumans.md'));
    assert.match(preview.html, /width="300" height="200"/);
    assert.match(preview.html, /data-page-path="World\/Humans.md"/);
    assert.equal((await publicApp.request('/api/page?path=World%2FHumans.md')).status, 404);
    assert.equal((await publicApp.request('/media/' + media)).status, 404);
    assert.equal(await (await admin.request('/media/' + media)).text(), 'first-image');
    await admin.service.wiki!.publish(human.id, { revision: human.revision });
    assert.equal(await (await publicApp.request('/media/' + media)).text(), 'first-image');
    const portrait = human.imageBindings!['m:../Attachments/art%20&%20%C3%A9.png']!.path!;
    assert.equal(await (await publicApp.request('/media/' + portrait.split('/').map(encodeURIComponent).join('/'))).text(), 'second-portrait');
    remote.put('Attachments/art.png', 'second-image');
    const next = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: next.listingId, paths: ['World/Humans.md'] }).id);
    assert.equal(job.reviews[0]!.status, 'update');
    await nox.apply(job.id, { decisions: {}, confirmReplace: false });
    const updated = admin.service.wiki!.get(human.id); const newMedia = updated.imageBindings!['w:art.png']!.path!;
    assert.notEqual(updated.revision, human.revision); assert.notEqual(newMedia, media);
    assert.equal((await publicApp.request('/media/' + newMedia)).status, 404);
    assert.equal(await (await publicApp.request('/media/' + media)).text(), 'first-image');
    // Publishing an unrelated page never authorizes the new draft image.
    await admin.service.wiki!.publish(admin.service.wiki!.pages.find(page => page.path === 'home.md')!.id, { revision: admin.service.wiki!.pages.find(page => page.path === 'home.md')!.revision });
    assert.equal((await publicApp.request('/media/' + newMedia)).status, 404);
    await admin.service.wiki!.publish(updated.id, { revision: updated.revision });
    assert.equal(await (await publicApp.request('/media/' + newMedia)).text(), 'second-image');
    assert.equal((await publicApp.request('/media/' + media)).status, 404);
    assert.equal((await admin.service.wiki!.repository.run('log', '-p')).includes('test-private-key'), false);
    await admin.service.wiki!.move(updated.id, { path: 'Places/People/Humans.md', revision: updated.revision });
    const movedPreview = await json<{ html: string }>(await admin.request('/api/page?path=Places%2FPeople%2FHumans.md'));
    assert.equal((movedPreview.html.match(/data-media-path=/g) || []).length, 2);
    assert.equal((movedPreview.html.match(/src="[^"]+nox-sync/g) || []).length, 2);
    await admin.service.close();
    const restarted = await f.start('admin');
    assert.equal(restarted.service.nox!.settings().hasKey, true);
    assert.equal(restarted.service.wiki!.get(human.id).origin!.path, 'World/Humans.md');
    assert.equal(await (await publicApp.request('/media/' + newMedia)).text(), 'second-image');
  } finally { await remote.close(); await f.cleanup(); }
});

test('NoX reimports detect local edits, no-op unchanged notes, protect paths and revalidate the review', async () => {
  const f = await fixture(); const remote = await fakeNox();
  try {
    remote.put('World/Humans.md', '# Humans\nRemote one.'); remote.put('home.md', '# Vault home'); remote.put('guides/first.md', '# Collision');
    remote.put('Unicode/Eléhria.md', '# Unicode'); remote.put('../escape.md', '# Invalid');
    remote.put('GUIDES/new.md', '# Case collision'); remote.put('guides/first.md/child.md', '# Parent collision');
    const admin = await f.start('admin'); const nox = admin.service.nox!; const wiki = admin.service.wiki!;
    await nox.connect({ url: remote.url, apiKey: 'test-private-key' });
    let listing = await nox.list('vault-id');
    let job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: listing.files.map(file => file.path) }).id);
    assert.equal(job.reviews.filter(review => review.status === 'blocked').length, 5);
    await nox.apply(job.id, { decisions: {}, confirmReplace: false });
    const human = wiki.pages.find(page => page.path === 'World/Humans.md')!;
    listing = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    assert.equal(job.reviews[0]!.status, 'unchanged'); const head = await wiki.repository.head();
    await nox.apply(job.id, { decisions: {}, confirmReplace: false }); assert.equal(await wiki.repository.head(), head);
    await wiki.save(human.id, { content: '# Humans\nLocal change.', revision: human.revision });
    remote.put('World/Humans.md', '# Humans\nRemote two.');
    listing = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    assert.equal(job.reviews[0]!.status, 'conflict');
    assert.equal(job.reviews[0]!.localContent, '# Humans\nLocal change.');
    await nox.apply(job.id, { decisions: {}, confirmReplace: false }); assert.match(wiki.get(human.id).content, /Local change/);
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    await assert.rejects(nox.apply(job.id, { decisions: { 'World/Humans.md': 'replace' }, confirmReplace: false }), /error.invalidRequest/);
    await nox.apply(job.id, { decisions: { 'World/Humans.md': 'replace' }, confirmReplace: true }); assert.match(wiki.get(human.id).content, /Remote two/);
    remote.put('World/Humans.md', '# Humans\nRemote three.'); listing = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    await wiki.save(human.id, { content: '# Humans\nAnother local edit.', revision: wiki.get(human.id).revision });
    await assert.rejects(nox.apply(job.id, { decisions: {}, confirmReplace: false }), /error.noxLocalChanged/);
    const moved = await wiki.move(human.id, { path: 'Renamed/Humans.md', revision: wiki.get(human.id).revision });
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    assert.equal(job.reviews[0]!.targetPath, moved.page.path); assert.equal(job.reviews[0]!.status, 'conflict');
    await nox.apply(job.id, { decisions: { 'World/Humans.md': 'replace' }, confirmReplace: true });
    assert.equal(wiki.get(human.id).path, 'Renamed/Humans.md');
    await wiki.delete(human.id, { revision: wiki.get(human.id).revision });
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['World/Humans.md'] }).id);
    assert.equal(job.reviews[0]!.reason!.code, 'error.noxDeleted');
  } finally { await remote.close(); await f.cleanup(); }
});

test('NoX aborts changed, corrupt and cancelled preparations without altering documents', async () => {
  const f = await fixture(); const remote = await fakeNox();
  try {
    remote.put('Notes/First.md', '# First\n![[duplicate.png]]\n![[missing.png]]\n`![[code.png]]`');
    remote.put('A/duplicate.png', 'image-a'); remote.put('B/duplicate.png', 'image-b');
    const admin = await f.start('admin'); const nox = admin.service.nox!; const wiki = admin.service.wiki!;
    await nox.connect({ url: remote.url, apiKey: 'test-private-key' });
    let listing = await nox.list('vault-id'); const head = await wiki.repository.head();
    remote.put('Notes/First.md', '# Changed');
    let job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['Notes/First.md'] }).id);
    assert.equal(job.error!.code, 'error.noxChanged'); assert.equal(await wiki.repository.head(), head);
    listing = await nox.list('vault-id'); remote.corrupt(true);
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['Notes/First.md'] }).id);
    assert.equal(job.error!.code, 'error.noxIntegrity'); remote.corrupt(false);
    remote.delay(true); job = nox.prepare({ listingId: listing.listingId, paths: ['Notes/First.md'] });
    await nox.cancel(job.id); assert.equal(nox.job(job.id).state, 'cancelled'); remote.delay(false);
    assert.equal(await wiki.repository.head(), head);
    remote.put('Notes/First.md', '# First\n![[duplicate.png]]\n![[missing.png]]\n`![[code.png]]`'); listing = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['Notes/First.md'] }).id);
    assert.deepEqual(job.reviews[0]!.warnings, [{ reference: 'duplicate.png', reason: 'ambiguous' }, { reference: 'missing.png', reason: 'missing' }]);
    await nox.apply(job.id, { decisions: {}, confirmReplace: false });
    const note = wiki.pages.find(page => page.path === 'Notes/First.md')!;
    assert.equal(note.imageBindings!['w:missing.png']!.reason, 'missing');
    const candidates = (await fs.readdir(path.join(f.config.contentDir, '_images', 'nox-sync', nox.settings().connectionId!, createHash('sha256').update('vault-id').digest('hex').slice(0, 24))));
    assert.equal(candidates.length, 2);
    const candidateHash = createHash('sha256').update('image-a').digest('hex');
    const candidatePath = `nox-sync/${nox.settings().connectionId}/${createHash('sha256').update('vault-id').digest('hex').slice(0, 24)}/${candidateHash}/A/duplicate.png`;
    const repaired = await wiki.repairImage(note.id, { revision: note.revision, occurrence: 0, path: candidatePath, name: 'duplicate.png', sha256: candidateHash });
    const repairedPreview = await json<{ html: string }>(await admin.request('/api/page?path=Notes%2FFirst.md'));
    assert.match(repairedPreview.html, /data-media-path="_images\/nox-sync\//);
    assert.equal((repairedPreview.html.match(/data-image-index=/g) || []).length, 1);
    const publicApp = await f.start('public');
    assert.equal((await publicApp.request('/media/_images/' + candidatePath)).status, 404);
    await wiki.publish(note.id, { revision: repaired.page.revision });
    assert.equal(await (await publicApp.request('/media/_images/' + candidatePath)).text(), 'image-a');
    const apiKey = remote.rotate(); await assert.rejects(nox.vaults(), /error.noxAuth/);
    await nox.connect({ url: remote.url, apiKey }); assert.equal((await nox.vaults()).length, 1);
    await nox.disconnect(); assert.equal(nox.settings().hasKey, false); assert.equal(wiki.get(note.id).deleted, false);
    await nox.connect({ url: remote.url, apiKey });
    listing = await nox.list('vault-id');
    job = await ready(nox, nox.prepare({ listingId: listing.listingId, paths: ['Notes/First.md'] }).id);
    assert.equal(job.reviews[0]!.status, 'conflict');
    const forged = await fetch(admin.url + '/api/admin/nox/connection', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: remote.url, apiKey }) });
    assert.equal(forged.status, 403);
  } finally { await remote.close(); await f.cleanup(); }
});
