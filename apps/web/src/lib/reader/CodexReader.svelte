<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';
  import type { PageResponse } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  import { ReaderModel } from './reader-model.svelte';
  import NavigationTree from './NavigationTree.svelte';
  import TableOfContents from './TableOfContents.svelte';
  import Article from './Article.svelte';
  import './reader.css';

  let { apiBase, basePath = '', path = 'home.md', t, onNavigate, onPage, onPublication, onImagePick, showLinkWarnings = false, toolbar, body, hash = '', refreshKey = 0 }: {
    apiBase: string; basePath?: string; path?: string; hash?: string; refreshKey?: number; t: Translator;
    onNavigate: (path: string, hash?: string, replace?: boolean) => void;
    onPage?: (page: PageResponse | null) => void; onPublication?: () => void;
    onImagePick?: (page: PageResponse, occurrence: number) => Promise<void>;
    showLinkWarnings?: boolean;
    toolbar?: Snippet<[PageResponse | null]>; body?: Snippet;
  } = $props();
  const model = new ReaderModel(() => apiBase, () => onPublication?.());
  const uid = $props.id();
  let mobileOpen = $state(false);
  let activeHeading = $state('');
  let article = $state<HTMLElement>();
  let main: HTMLElement;
  let previousPath = '';
  let scrollFrame = 0;
  let navigatePending = false;

  $effect(() => {
    refreshKey;
    const next = path;
    const changed = next !== previousPath;
    previousPath = next;
    navigatePending = changed;
    void model.open(next);
  });
  $effect(() => {
    const page = model.page;
    onPage?.(page);
    if (page?.redirected) onNavigate(page.path, hash, true);
  });
  $effect(() => {
    if (!model.page || model.loading || body) return;
    const destination = hash;
    void tick().then(() => {
      if (destination) jump(decodeURIComponent(destination.replace(/^#/, '')), false);
      else if (navigatePending) { main?.scrollIntoView({ block: 'start' }); main?.focus({ preventScroll: true }); }
      navigatePending = false;
      updateActive();
    });
  });
  function jump(id: string, update = true) {
    const heading = article?.querySelector<HTMLElement>('#' + CSS.escape(id));
    heading?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    activeHeading = id;
    if (update) onNavigate(model.page?.path || path, '#' + encodeURIComponent(id), true);
  }
  function updateActive() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      const headings = article?.querySelectorAll<HTMLElement>('h2[id],h3[id],h4[id],h5[id],h6[id]');
      if (!headings?.length) { activeHeading = ''; return; }
      let selected = headings[0]!.id;
      for (const heading of headings) { if (heading.getBoundingClientRect().top <= 160) selected = heading.id; }
      activeHeading = selected;
    });
  }
  function navigate(file: string, fragment?: string) { mobileOpen = false; onNavigate(file, fragment); }
  onMount(() => {
    const disconnect = model.connect();
    return () => { disconnect(); cancelAnimationFrame(scrollFrame); };
  });
</script>

<svelte:window onscroll={updateActive} onresize={updateActive} />
<div class="codex" class:workspace={Boolean(body)} class:show-link-warnings={showLinkWarnings}>
  <button class="mobile-nav-button" onclick={() => mobileOpen = !mobileOpen} aria-expanded={mobileOpen} aria-controls={uid + '-nav'}>
    <span aria-hidden="true">☰</span> {t(mobileOpen ? 'nav.close' : 'nav.open')}
  </button>
  <aside id={uid + '-nav'} class="sidebar" class:mobile-open={mobileOpen}>
    <div class="sidebar-label">{t('nav.title')}</div>
    <NavigationTree nodes={model.navigation} activePath={model.page?.path || path} {basePath} {t} onNavigate={navigate} />
    <div class="sidebar-footer">{t('nav.count', { count: model.count })}</div>
  </aside>
  <main bind:this={main} id="content" tabindex="-1" class="reader-main">
    <div class="page-context">
      <a href={pageUrl('home.md', basePath)} onclick={event => { event.preventDefault(); navigate('home.md'); }}>{t('nav.home')}</a>
      {#if (model.page?.path || path) !== 'home.md'}
        <span aria-hidden="true">/</span><span>{(model.page?.path || path).replace(/\.md$/i, '').split('/').join(' / ')}</span>
      {/if}
    </div>
    {#if toolbar}<div class="page-toolbar">{@render toolbar(model.page)}</div>{/if}
    {#if model.offline}<p class="notice" role="status">{t('connection.offline')}</p>{/if}
    {#if body}
      {@render body()}
    {:else if model.loading && !model.page}
      <p class="muted" role="status">{t('app.loading')}</p>
    {:else if model.error}
      <section class="empty-state">
        <span class="empty-mark" aria-hidden="true">◇</span>
        <h1>{t('page.unavailable')}</h1><p>{t(model.error.code, model.error.params)}</p>
        <button onclick={() => model.open(path)}>{t('action.retry')}</button>
      </section>
    {:else if model.page}
      {#if model.page.headings.length}
        <details class="mobile-toc"><summary>{t('toc.title')}</summary>
          <TableOfContents headings={model.page.headings} active={activeHeading} {t} onSelect={jump} />
        </details>
      {/if}
      <Article page={model.page} {basePath} {apiBase} {t} {onImagePick} onNavigate={navigate} onHeading={jump} onElement={element => { article = element; }} />
    {/if}
  </main>
  {#if model.page?.headings.length && !body && !model.error}
    <aside class="desktop-toc">
      <div class="toc-title">{t('toc.title')}</div>
      <TableOfContents headings={model.page.headings} active={activeHeading} {t} onSelect={jump} />
    </aside>
  {/if}
</div>
