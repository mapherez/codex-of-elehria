<script lang="ts">
  import { untrack } from 'svelte';
  import type { ApiError, PageResponse, MutationResult } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import type { AdminClient } from './admin-client';
  import { errorDetail } from '../lib/api';
  let { action, page, client, t, onDone, onClose }: {
    action: 'move' | 'delete'; page: PageResponse; client: AdminClient; t: Translator;
    onDone: (result: MutationResult) => void; onClose: () => void;
  } = $props();
  let target = $state(untrack(() => page.path));
  let error = $state<ApiError['error'] | null>(null);
  let busy = $state(false);
  async function submit(event: SubmitEvent) {
    event.preventDefault(); busy = true;
    try {
      onDone(action === 'move' ? await client.move(page.id, { path: target, revision: page.revision }) : await client.delete(page.id, { revision: page.revision }));
    } catch (failure) { error = errorDetail(failure); }
    finally { busy = false; }
  }
</script>

  <form class="drawer-form" method="post" onsubmit={submit}>
    <p class="muted">{t(action === 'move' ? 'move.hint' : 'delete.description', { path: page.path })}</p>
    {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
    {#if action === 'move'}<label for="destination">{t('editor.path')}</label><input id="destination" name="path" bind:value={target} required />{/if}
    <div class="dialog-actions"><button type="button" onclick={onClose} disabled={busy}>{t('action.cancel')}</button>
      <button type="submit" class:danger={action === 'delete'} class:primary={action === 'move'} disabled={busy}>{t(action === 'move' ? 'action.move' : 'action.delete')}</button>
    </div>
  </form>
