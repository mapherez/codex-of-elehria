<script lang="ts">
  import { onMount } from 'svelte';
  import type { ApiError, PageRecord } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import type { AdminClient } from './admin-client';
  import { errorDetail } from '../lib/api';
  let { client, t, onSelect, onClose, showClose = true }: { client: AdminClient; t: Translator; onSelect: (id: string) => void; onClose: () => void; showClose?: boolean } = $props();
  let pages = $state<Omit<PageRecord, 'content'>[]>([]);
  let error = $state<ApiError['error'] | null>(null);
  let loading = $state(true);
  onMount(() => {
    let alive = true;
    void client.pages().then(result => { if (alive) pages = result.filter(page => page.deleted); })
      .catch(failure => { if (alive) error = errorDetail(failure); }).finally(() => { if (alive) loading = false; });
    return () => { alive = false; };
  });
</script>

<section><div class="workspace-heading"><h1 class="workspace-title">{t('history.removedTitle')}</h1>{#if showClose}<button onclick={onClose}>{t('action.close')}</button>{/if}</div>
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if loading}<p>{t('app.loading')}</p>{:else if !pages.length}<p class="muted">{t('history.removedEmpty')}</p>{/if}
  <ul class="history-list">{#each pages as page (page.id)}<li><code>{page.path}</code><button onclick={() => onSelect(page.id)}>{t('action.history')}</button></li>{/each}</ul>
</section>
