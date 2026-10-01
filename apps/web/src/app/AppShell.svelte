<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { PublicConfig } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import { pageUrl } from '../../../../packages/contracts/routes';
  import HeaderSearch from '../lib/search/HeaderSearch.svelte';
  import Drawer from '../lib/Drawer.svelte';
  import Icon from '../lib/Icon.svelte';
  import './standalone.css';
  let { config, t, children, onHome, navigationOpen = $bindable(false), navigationId,
    actionsOpen = $bindable(false), actions, onActionsClosed, actionsTitle, onActionsBack, actionsWide = false, searchQuery, searchRefreshKey = 0, onSearch, onSearchNavigate }: {
    config: PublicConfig; t: Translator; children: Snippet; onHome: () => void;
    searchQuery?: string; searchRefreshKey?: number; onSearch: (query: string) => boolean | void; onSearchNavigate: (path: string, hash: string) => boolean | void;
    navigationOpen?: boolean; navigationId: string; actionsOpen?: boolean; actions?: Snippet; onActionsClosed?: () => void;
    actionsTitle?: string; onActionsBack?: () => void; actionsWide?: boolean;
  } = $props();
  const uid = $props.id();
  const actionsId = uid + '-actions';
  let searchOpen = $state(false);
  $effect(() => { if (actionsOpen || navigationOpen) searchOpen = false; });
</script>

<a class="skip-link" href="#content">{t('app.skip')}</a>
<header class="app-header" class:search-open={searchOpen} class:with-actions={Boolean(actions)}>
  <button type="button" class="header-control navigation-trigger" aria-label={t(navigationOpen ? 'nav.close' : 'nav.open')}
    aria-expanded={navigationOpen} aria-controls={navigationId} onclick={() => { actionsOpen = false; navigationOpen = !navigationOpen; }}>
    <Icon name="menu" size={22} />
  </button>
  <a class="brand" href={pageUrl('home.md', config.basePath)} onclick={event => { event.preventDefault(); onHome(); }}>
    {#if config.brand.logoUrl}<img src={config.brand.logoUrl} alt="" width="34" height="34" />
    {:else}<span class="brand-mark" aria-hidden="true">{config.brand.name.charAt(0)}</span>{/if}
    <span class="brand-name">{config.brand.name}</span>
  </a>
  <span class="brand-subtitle">{t('app.subtitle')}</span>
  <div class="header-tools">
    <HeaderSearch apiBase={config.basePath + '/api'} basePath={config.basePath} {t} bind:open={searchOpen} routeQuery={searchQuery} refreshKey={searchRefreshKey}
      onOpen={() => { actionsOpen = false; navigationOpen = false; }} onNavigate={onSearchNavigate} onShowAll={onSearch} />
  {#if actions}
    <button type="button" class="header-control actions-trigger" aria-label={t(actionsOpen ? 'admin.close' : 'admin.open')}
      aria-expanded={actionsOpen} aria-controls={actionsId} onclick={() => { navigationOpen = false; actionsOpen = !actionsOpen; }}>
      <Icon name="left" size={22} />
    </button>
  {/if}
  </div>
</header>
<div class="standalone-content" class:actions-visible={actionsOpen} class:actions-wide={actionsWide}>{@render children()}</div>
{#if actions}<Drawer id={actionsId} title={actionsTitle || t('admin.actions')} {t} bind:open={actionsOpen} onClosed={onActionsClosed} onBack={onActionsBack} wide={actionsWide}>{@render actions()}</Drawer>{/if}
