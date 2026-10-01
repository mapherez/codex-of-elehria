import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type { NoxFile } from '../packages/contracts/nox-sync';

export async function fakeNox() {
  let revision = 1;
  let key = 'test-private-key';
  let corrupt = false;
  let delayed = false;
  const content = new Map<string, { bytes: Buffer; revision: number }>();
  const requests: string[] = [];
  function put(file: string, bytes: string | Buffer) { content.set(file, { bytes: Buffer.from(bytes), revision: revision++ }); }
  function metadata(file: string): NoxFile {
    const data = content.get(file)!;
    return { path: file, hash: createHash('sha256').update(data.bytes).digest('hex'), size: data.bytes.length, revision: data.revision };
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost'); requests.push(url.pathname);
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== 'Bearer ' + key) { res.writeHead(401); res.end('{}'); return; }
    if (url.pathname === '/v1/auth/check') { res.end(JSON.stringify({ ok: true, user: 'fixture', role: 'USER' })); return; }
    if (url.pathname === '/v1/vaults') { res.end(JSON.stringify({ vaults: [{ vaultId: 'vault-id', name: 'Knowledge', revision }] })); return; }
    if (url.searchParams.get('vaultId') !== 'vault-id') { res.writeHead(404); res.end('{}'); return; }
    if (url.pathname === '/v1/files') {
      res.end(JSON.stringify({ vaultId: 'vault-id', serverRevision: revision, files: [...content.keys()].sort().map(metadata) })); return;
    }
    if (url.pathname === '/v1/files/download') {
      const file = url.searchParams.get('path')!;
      if (!content.has(file)) { res.writeHead(404); res.end('{}'); return; }
      const meta = metadata(file);
      assert.equal(url.searchParams.get('expectedHash')?.length, 64);
      assert.match(url.searchParams.get('expectedRevision') || '', /^\d+$/);
      if (url.searchParams.get('expectedHash') !== meta.hash || url.searchParams.get('expectedRevision') !== String(meta.revision)) {
        res.writeHead(409); res.end(JSON.stringify({ code: 'FILE_CHANGED' })); return;
      }
      res.setHeader('content-type', 'application/octet-stream'); res.setHeader('content-length', meta.size);
      res.setHeader('x-nox-sync-hash', meta.hash); res.setHeader('x-nox-sync-revision', meta.revision);
      const bytes = Buffer.from(content.get(file)!.bytes);
      if (corrupt && bytes.length) bytes[0] = bytes[0]! ^ 1;
      if (delayed) { const pending = setTimeout(() => res.end(bytes), 500); res.on('close', () => clearTimeout(pending)); }
      else res.end(bytes);
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, put, content, requests,
    rotate() { key = 'rotated-private-key'; return key; }, corrupt(value: boolean) { corrupt = value; }, delay(value: boolean) { delayed = value; },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  };
}
