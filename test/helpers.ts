import fs from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { createApplication } from '../apps/server/src/http/application';
import type { RuntimeConfig } from '../apps/server/src/config';
import { english } from '../packages/i18n';
import site from '../config/site.json';

const testRoot = path.resolve('.tools/test-runs');
export async function fixture({ publishInitial = true } = {}) {
  await fs.mkdir(testRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(testRoot, 'wiki-'));
  const contentDir = path.join(root, 'dist');
  const stateDir = path.join(root, 'state');
  await fs.mkdir(path.join(contentDir, 'guides'), { recursive: true });
  await fs.writeFile(path.join(contentDir, 'home.md'), '# Welcome\n\n## Introduction\nA home page.\n');
  await fs.writeFile(path.join(contentDir, 'guides', 'first.md'), '# First\n\n[Home](../home.md)\n\n## A section\nOriginal text.\n');
  const config: RuntimeConfig = {
    mode: 'admin', site: { ...site, publicationPollMs: 100 }, messages: english,
    contentDir, stateDir, webDir: path.resolve('build/admin'), host: '127.0.0.1', port: 4001,
    adminOrigins: ['http://localhost:4001']
  };
  const services: Awaited<ReturnType<typeof createApplication>>[] = [];
  const servers: Server[] = [];
  let firstAdmin = true;
  async function start(mode: 'public' | 'admin') {
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as AddressInfo).port;
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const url = `http://127.0.0.1:${port}`;
    const service = await createApplication({ ...config, mode, port, adminOrigins: [url], webDir: path.resolve(`build/${mode}`) });
    services.push(service);
    if (mode === 'admin' && firstAdmin) {
      firstAdmin = false;
      if (publishInitial) for (const page of service.wiki!.pages.filter(page => !page.deleted)) {
        await service.wiki!.publish(page.id, { revision: page.revision });
      }
    }
    const server = service.app.listen(port, '127.0.0.1');
    servers.push(server);
    await new Promise<void>(resolve => server.once('listening', resolve));
    let token = '';
    async function request(endpoint: string, method = 'GET', body?: unknown) {
      const headers: Record<string, string> = mode === 'admin' ? { origin: url, 'x-wiki-token': token } : {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      return fetch(url + endpoint, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    }
    if (mode === 'admin') {
      const response = await request(config.site.basePath + '/api/admin/session');
      if (!response.ok) throw new Error(await response.text());
      token = (await response.json() as { token: string }).token;
    }
    return { service, server, url, request, token };
  }
  async function cleanup() {
    for (const service of services) await service.close();
    for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    const resolved = path.resolve(root);
    if (!resolved.startsWith(testRoot + path.sep)) throw new Error('Unsafe test cleanup path');
    await fs.rm(resolved, { recursive: true, force: true });
  }
  return { root, config, start, cleanup };
}
