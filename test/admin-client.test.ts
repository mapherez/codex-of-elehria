import test from 'node:test';
import assert from 'node:assert/strict';
import { AdminClient } from '../apps/web/src/admin/admin-client';
import { ApiClientError } from '../apps/web/src/lib/api';

test('preview distinguishes an unavailable endpoint from a missing page and preserves other errors', async t => {
  let status = 404;
  t.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/admin/session')
    ? Response.json({ token: 'test-token' })
    : Response.json({ error: { code: status === 404 ? 'error.notFound' : 'error.tooLarge' } }, { status }));
  const client = new AdminClient('http://localhost/api');
  await assert.rejects(client.preview({ content: '# Draft' }), (error: unknown) =>
    error instanceof ApiClientError && error.status === 404 && error.detail.code === 'error.previewUnavailable');
  status = 413;
  await assert.rejects(client.preview({ content: '# Draft' }), (error: unknown) =>
    error instanceof ApiClientError && error.status === 413 && error.detail.code === 'error.tooLarge');
});
