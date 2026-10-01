<script lang="ts">
  import { onMount } from 'svelte';
  import type { ApiError, PendingPublication } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import { errorDetail } from '../lib/api';
  import type { AdminClient } from './admin-client';
  let { client, t, onPublished }: { client: AdminClient; t: Translator; onPublished: () => void } = $props();
  let pages = $state<PendingPublication[]>([]);
  let loading = $state(true);
  let publishing = $state(false);
  let error = $state<ApiError['error'] | null>(null);
  let completed = $state<number | null>(null);
  let alive = true;
  async function refresh() {
    loading = true; error = null; completed = null;
    try { const result = await client.pendingPublications(); if (alive) pages = result; }
    catch (failure) { if (alive) error = errorDetail(failure); }
    finally { if (alive) loading = false; }
  }
  async function publish() {
    if (publishing || loading || !pages.length) return;
    publishing = true; error = null; completed = null;
    try {
      const result = await client.publishBatch({ pages: pages.map(({ id, revision }) => ({ id, revision })) });
      onPublished();
      if (alive) { completed = result.count; pages = await client.pendingPublications(); }
    } catch (failure) { if (alive) error = errorDetail(failure); }
    finally { if (alive) publishing = false; }
  }
  onMount(() => { void refresh(); return () => { alive = false; }; });
</script>

<section class="publish-pending" aria-busy={loading || publishing}>
  <p class="muted">{t('publication.batchDescription')}</p>
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if loading}<p role="status">{t('app.loading')}</p>
  {:else}
    {#if completed !== null}<p class="save-notice" role="status">{t('publication.batchComplete', { count: completed })}</p>{/if}
    {#if pages.length}
      <p>{t('publication.batchCount', { count: pages.length })}</p>
      <ul class="pending-pages">{#each pages as page (page.id)}<li><span>{page.path}</span><span class="publication-status pending">{t(`publication.${page.status}`)}</span></li>{/each}</ul>
    {:else}<p role="status">{t('publication.batchEmpty')}</p>{/if}
  {/if}
  <div class="publish-pending-controls">
    {#if pages.length}<button class="primary" disabled={loading || publishing || Boolean(error)} onclick={publish}>{t(publishing ? 'publication.publishing' : 'publication.batchConfirm', { count: pages.length })}</button>{/if}
    <button class="quiet" disabled={loading || publishing} onclick={refresh}>{t('publication.batchRefresh')}</button>
  </div>
</section>
