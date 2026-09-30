import { mount, type Component } from 'svelte';
import type { PublicConfig } from '../../../../packages/contracts';
import { createTranslator } from '../../../../packages/i18n';
import { WikiClient, errorDetail } from '../lib/api';

export async function bootstrap(App: Component<{ config: PublicConfig }>): Promise<void> {
  const target = document.getElementById('app')!;
  const configured = document.querySelector<HTMLMetaElement>('meta[name="codex-base"]')?.content || '';
  const basePath = configured.startsWith('__') ? '' : configured;
  try {
    const config = await new WikiClient(basePath + '/api').config();
    document.documentElement.lang = config.locale;
    mount(App, { target, props: { config } });
  } catch (error) {
    const t = createTranslator();
    const detail = errorDetail(error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = t(detail.code, detail.params);
    target.replaceChildren(message);
  }
}
