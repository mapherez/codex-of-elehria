import { loadConfig, defaultTranslator } from './config';
import { createApplication } from './http/application';
import { createTranslator } from '../../../packages/i18n';
import { DomainError } from './domain/errors';

try {
  const config = await loadConfig(process.argv[2] || process.env.WIKI_MODE || 'public');
  const t = createTranslator(config.site.locale, config.messages);
  const service = await createApplication(config);
  const server = service.app.listen(config.port, config.host, () => {
    console.log(t('log.listening', { mode: config.mode, url: `http://${config.host}:${config.port}${config.site.basePath}` }));
  });
  server.on('error', async error => { console.error(t('log.startFailed', { reason: error.message })); await service.close(); process.exitCode = 1; });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    await service.close();
    server.closeAllConnections();
  });
} catch (error) {
  console.error(defaultTranslator('log.startFailed', { reason: error instanceof DomainError ? defaultTranslator(error.code, error.params) : error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}
