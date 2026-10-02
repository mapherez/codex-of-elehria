import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { validateTheme, type ThemeConfig } from '../../../packages/theme';
import { createTranslator, english, type Dictionary } from '../../../packages/i18n';
import { DomainError } from './domain/errors';

const schema = z.object({
  theme: z.custom<ThemeConfig>(value => validateTheme(value).ok).optional(),
  locale: z.string().min(2),
  brand: z.object({ name: z.string().min(1), logoUrl: z.string().nullable() }),
  basePath: z.string().regex(/^(\/[a-zA-Z0-9_-]+)*$/),
  gitAuthor: z.object({ name: z.string().min(1).regex(/^[^\r\n<>]+$/), email: z.string().regex(/^[^@\s<>]+@[^@\s<>]+$/) }),
  maxPageBytes: z.number().int().positive(),
  publicationPollMs: z.number().int().min(100)
});
export type SiteConfig = z.infer<typeof schema>;
export interface RuntimeConfig {
  mode: 'admin' | 'public'; site: SiteConfig; messages: Dictionary;
  contentDir: string; stateDir: string; webDir: string;
  host: string; port: number; adminOrigins: string[];
}

export async function loadConfig(mode: string, env: NodeJS.ProcessEnv = process.env): Promise<RuntimeConfig> {
  if (mode !== 'admin' && mode !== 'public') throw new DomainError('error.config');
  const parsed = schema.safeParse(JSON.parse(await fs.readFile(env.SITE_CONFIG_FILE || env.SITE_CONFIG || 'config/site.json', 'utf8')));
  if (!parsed.success) throw new DomainError('error.config');
  const site = parsed.data;
  const overrides: Record<string, unknown> = env.LOCALE_FILE ? JSON.parse(await fs.readFile(env.LOCALE_FILE, 'utf8')) : {};
  if (Object.values(overrides).some(value => typeof value !== 'string')) throw new DomainError('error.config');
  const messages = { ...english, ...overrides } as Dictionary;
  const port = Number(env.PORT || (mode === 'admin' ? env.ADMIN_PORT || 3001 : env.PUBLIC_PORT || 3000));
  const contentDir = path.resolve(env.CONTENT_DIR || 'dist');
  const stateDir = path.resolve(env.STATE_DIR || 'state');
  if (stateDir === contentDir || stateDir.startsWith(contentDir + path.sep) || !Number.isInteger(port) || port < 1 || port > 65535) throw new DomainError('error.config');
  return {
    mode, site, messages, contentDir, stateDir, port,
    host: env.HOST || '127.0.0.1',
    webDir: path.resolve(env.WEB_DIR || `build/${mode}`),
    adminOrigins: (env.ADMIN_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`).split(',').map(origin => origin.trim())
  };
}

export const defaultTranslator = createTranslator();
