<script lang="ts">
  import { tick } from 'svelte';
  import type { ApiError, SearchResponse } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import { WikiClient, errorDetail } from '../api';
  import SearchResultRow from './SearchResultRow.svelte';
  import './search.css';
  let { apiBase, basePath, query, t, refreshKey = 0, onNavigate, onSearch }: {
    apiBase: string; basePath: string; query: string; t: Translator; refreshKey?: number;
    onNavigate: (path: string, hash: string) => void; onSearch: (query: string) => void;
  } = $props();
  const uid = $props.id();
  let input = $state(''); let response = $state<SearchResponse | null>(null);
  let error = $state<ApiError['error'] | null>(null); let loading = $state(false); let more = $state(false);
  let heading: HTMLHeadingElement; let activeController: AbortController | undefined; let previousQuery: string | undefined;
  $effect(() => {
    const value = query; refreshKey; input = value; response = null; error = null; loading = true;
    const changed = value !== previousQuery; previousQuery = value;
    const controller = new AbortController(); activeController = controller;
    void new WikiClient(apiBase).search(value, 0, 50, controller.signal)
      .then(result => { if (!controller.signal.aborted) { response = result; if (changed) void tick().then(() => { heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start' }); }); } })
      .catch(failure => { if (!controller.signal.aborted) error = errorDetail(failure); })
      .finally(() => { if (!controller.signal.aborted) loading = false; });
    return () => controller.abort();
  });
  async function loadMore() {
    if (!response || more || !activeController) return;
    const initial = response; const controller = activeController;
    more = true; error = null;
    try {
      const client = new WikiClient(apiBase);
      let next = await client.search(query, initial.results.length, 50, controller.signal);
      if (controller.signal.aborted) return;
      if (next.revision !== initial.revision) {
        next = await client.search(query, 0, 50, controller.signal);
        if (!controller.signal.aborted) response = next;
      } else response = { ...next, offset: 0, results: [...initial.results, ...next.results] };
    } catch (failure) { if (!controller.signal.aborted) error = errorDetail(failure); }
    finally { more = false; }
  }
</script>
<section class="search-page" aria-busy={loading || more}>
  <h1 tabindex="-1" bind:this={heading}>{t('search.title')}</h1>
  <form class="search-page-form" role="search" aria-label={t('search.label')} onsubmit={event => { event.preventDefault(); onSearch(input.trim()); }}>
    <label for={uid + '-query'} class="search-visually-hidden">{t('search.query')}</label>
    <input id={uid + '-query'} name="q" type="search" bind:value={input} maxlength="300" placeholder={t('search.placeholder')} autocomplete="off" />
    <button type="submit">{t('search.submit')}</button>
  </form>
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if loading}<p class="muted">{t('search.loading')}</p>
  {:else if response}
    <p class="search-summary" role="status">{t(response.total ? 'search.countQuery' : 'search.empty', { count: response.total, query: response.query })}</p>
    <ul class="search-page-list" role="list">{#each response.results as result (result.id)}<li><SearchResultRow {result} {basePath} {onNavigate} /></li>{/each}</ul>
    {#if response.results.length < response.total}<button type="button" class="quiet" onclick={loadMore} disabled={more}>{t(more ? 'search.loading' : 'search.more')}</button>{/if}
  {/if}
</section>
