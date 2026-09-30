<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { PublicConfig } from '../../../../packages/contracts';
  import { createTranslator } from '../../../../packages/i18n';
  import AppShell from './AppShell.svelte';
  import { StandaloneRoute } from './route.svelte';
  import CodexReader from '../lib/reader/CodexReader.svelte';
  let { config }: { config: PublicConfig } = $props();
  const initialConfig = untrack(() => config);
  const t = createTranslator(initialConfig.locale, initialConfig.messages);
  const route = new StandaloneRoute(initialConfig.basePath);
  onMount(() => route.connect());
</script>

<AppShell {config} {t} onHome={() => route.navigate('home.md')}>
  <CodexReader apiBase={config.basePath + '/api'} basePath={config.basePath} path={route.path} hash={route.hash} {t}
    onNavigate={(path, hash, replace) => route.navigate(path, hash, replace)}
    onPage={page => { document.title = page ? `${page.title} · ${config.brand.name}` : config.brand.name; }} />
</AppShell>
