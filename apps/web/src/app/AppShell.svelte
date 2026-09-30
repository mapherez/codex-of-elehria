<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PublicConfig } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import { pageUrl } from '../../../../packages/contracts/routes';
  import './standalone.css';
  let { config, t, admin = false, children, onHome }: { config: PublicConfig; t: Translator; admin?: boolean; children: Snippet; onHome: () => void } = $props();
</script>

<a class="skip-link" href="#content">{t('app.skip')}</a>
<header class="app-header">
  <a class="brand" href={pageUrl('home.md', config.basePath)} onclick={event => { event.preventDefault(); onHome(); }}>
    {#if config.brand.logoUrl}<img src={config.brand.logoUrl} alt="" width="34" height="34" />
    {:else}<span class="brand-mark" aria-hidden="true">{config.brand.name.charAt(0)}</span>{/if}
    <span>{config.brand.name}</span>
  </a>
  <span class="brand-subtitle">{t('app.subtitle')}</span>
  <span class="mode-label" class:admin><span aria-hidden="true">{admin ? '◈' : '◇'}</span> {t(admin ? 'app.admin' : 'app.reading')}</span>
</header>
{@render children()}
