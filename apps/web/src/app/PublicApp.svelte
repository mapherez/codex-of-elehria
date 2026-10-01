<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PublicConfig } from '../../../../packages/contracts';
  import { createTranslator } from '../../../../packages/i18n';
  import AppShell from './AppShell.svelte';
  import { StandaloneRoute } from './route.svelte';
  import SearchPage from '../lib/search/SearchPage.svelte';
  import CodexReader from '../lib/reader/CodexReader.svelte';
  let { config }: { config: PublicConfig } = $props();
  const initialConfig = untrack(() => config);
  const t = createTranslator(initialConfig.locale, initialConfig.messages);
  const route = new StandaloneRoute(initialConfig.basePath);
  const uid = $props.id();
  const navigationId = uid + '-navigation';
  let navigationOpen = $state(false);
  let searchRefreshKey = $state(0);
  $effect(() => { if (route.search !== null) document.title = t('search.title') + ' · ' + config.brand.name; });
  onMount(() => route.connect());
</script>

{#snippet searchResults()}
  <SearchPage apiBase={config.basePath + '/api'} basePath={config.basePath} query={route.search || ''} {t} refreshKey={searchRefreshKey}
    onNavigate={(path, hash) => route.navigate(path, hash)} onSearch={query => route.navigateSearch(query)} />
{/snippet}

<AppShell searchQuery={route.search ?? undefined} {searchRefreshKey} onSearch={query => route.navigateSearch(query)} onSearchNavigate={(path, hash) => route.navigate(path, hash)} {config} {t} {navigationId} bind:navigationOpen onHome={() => { navigationOpen = false; route.navigate('home.md'); }}>
  <CodexReader apiBase={config.basePath + '/api'} basePath={config.basePath} path={route.path} hash={route.hash} {t}
    {navigationId} bind:navigationOpen body={route.search === null ? undefined : searchResults} onPublication={() => searchRefreshKey++}
    onNavigate={(path, hash, replace) => route.navigate(path, hash, replace)}
    onPage={page => { if (route.search === null) document.title = page ? `${page.title} · ${config.brand.name}` : config.brand.name; }} />
</AppShell>
