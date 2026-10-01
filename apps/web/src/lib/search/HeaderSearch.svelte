<script lang="ts">
  import { tick } from 'svelte';
  import type { ApiError, SearchResponse } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import { WikiClient, errorDetail } from '../api';
  import Icon from '../Icon.svelte';
  import SearchResultRow from './SearchResultRow.svelte';
  import './search.css';
  let { apiBase, basePath, t, open = $bindable(false), routeQuery, refreshKey = 0, onOpen, onNavigate, onShowAll }: {
    apiBase: string; basePath: string; t: Translator; open?: boolean; routeQuery?: string; refreshKey?: number;
    onOpen: () => void; onNavigate: (path: string, hash: string) => boolean | void; onShowAll: (query: string) => boolean | void;
  } = $props();
  const uid = $props.id();
  let query = $state('');
  let response = $state<SearchResponse | null>(null);
  let error = $state<ApiError['error'] | null>(null);
  let loading = $state(false);
  let root: HTMLElement; let input = $state<HTMLInputElement>(); let trigger = $state<HTMLButtonElement>();
  $effect(() => { if (routeQuery !== undefined) query = routeQuery; });
  $effect(() => {
    const value = query.trim(); refreshKey;
    response = null; error = null;
    if (!open || !value) { loading = false; return; }
    loading = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void new WikiClient(apiBase).search(value, 0, 10, controller.signal)
        .then(result => { if (!controller.signal.aborted) response = result; })
        .catch(failure => { if (!controller.signal.aborted) error = errorDetail(failure); })
        .finally(() => { if (!controller.signal.aborted) loading = false; });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  });
  async function expand() { onOpen(); open = true; await tick(); input?.focus(); }
  async function close(restore = false) { open = false; if (restore) { await tick(); trigger?.focus(); } }
  function showAll(event?: SubmitEvent) {
    event?.preventDefault();
    if (query.trim() && onShowAll(query.trim()) !== false) void close();
  }
  function navigate(path: string, hash: string) { if (onNavigate(path, hash) !== false) void close(); }
  function outside(event: PointerEvent) { if (open && event.target instanceof Node && !root?.contains(event.target)) void close(); }
  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); void close(true); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const links = [...root.querySelectorAll<HTMLAnchorElement>('.search-result')];
    if (!links.length) return;
    event.preventDefault();
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === 'ArrowUp' && at === 0) input?.focus();
    else if (at < 0) links[event.key === 'ArrowDown' ? 0 : links.length - 1]?.focus();
    else links[(at + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length]?.focus();
  }
  function keyboard(element: HTMLElement) { element.addEventListener('keydown', keys); return { destroy: () => element.removeEventListener('keydown', keys) }; }
</script>
<svelte:window onpointerdown={outside} />
<div class="header-search" class:expanded={open} bind:this={root} use:keyboard>
  {#if !open}
    <button type="button" class="header-control search-trigger" aria-label={t('search.open')} aria-expanded="false" bind:this={trigger} onclick={expand}><Icon name="search" size={22} /></button>
  {:else}
    <form class="header-search-form" role="search" aria-label={t('search.label')} onsubmit={showAll}>
      <Icon name="search" size={20} />
      <label for={uid + '-query'} class="search-visually-hidden">{t('search.query')}</label>
      <input id={uid + '-query'} type="search" bind:this={input} bind:value={query} maxlength="300" name="q" autocomplete="off" placeholder={t('search.placeholder')} aria-controls={query.trim() ? uid + '-results' : undefined} />
      <button type="button" class="header-control search-close" aria-label={t('search.close')} onclick={() => close(true)}><Icon name="cancel" size={18} /></button>
    </form>
    {#if query.trim()}
      <nav id={uid + '-results'} class="quick-search-panel" aria-label={t('search.results')} aria-busy={loading}>
        {#if loading}<p class="search-status">{t('search.loading')}</p>
        {:else if error}<p class="search-status" role="alert">{t(error.code, error.params)}</p>
        {:else if response}
          <p class="search-status" role="status">{t(response.total ? 'search.count' : 'search.empty', { count: response.total, query: response.query })}</p>
          {#if response.results.length}<ul class="quick-search-list">{#each response.results as result (result.id)}<li><SearchResultRow {result} {basePath} onNavigate={navigate} /></li>{/each}</ul>{/if}
        {/if}
        <button type="button" class="search-show-all" onclick={() => showAll()}>{t('search.showAll')}<Icon name="right" size={16} /></button>
      </nav>
    {/if}
  {/if}
</div>
