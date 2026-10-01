<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ApiError, MutationResult, PageRecord } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import type { AdminClient } from './admin-client';
  import { errorDetail } from '../lib/api';
  let { page, client, t, changedElsewhere, onSaved, onCancel, onDirty, onControls }: {
    page: PageRecord | null; client: AdminClient; t: Translator; changedElsewhere: boolean;
    onSaved: (result: MutationResult) => void; onCancel: () => void; onDirty: (dirty: boolean) => void;
    onControls?: (controls: { save: () => void; busy: boolean } | null) => void;
  } = $props();
  const initial = untrack(() => page);
  let form = $state<HTMLFormElement>();
  let content = $state(initial?.content || '');
  let file = $state(initial?.path || '');
  let revision = $state(initial?.revision || '');
  let summary = $state('');
  let busy = $state(false);
  let error = $state<ApiError['error'] | null>(null);
  let current = $state<PageRecord | null>(null);
  const dirty = $derived(content !== (initial?.content || '') || file !== (initial?.path || '') || Boolean(summary));
  $effect(() => onDirty(dirty));
  $effect(() => { if (form) onControls?.({ save: () => form?.requestSubmit(), busy }); });
  onDestroy(() => onControls?.(null));
  async function save(event: SubmitEvent) {
    event.preventDefault(); busy = true; error = null;
    try {
      const result = initial ? await client.save(initial.id, { content, revision, message: summary }) : await client.create({ path: file, content, message: summary });
      onDirty(false); onSaved(result);
    } catch (failure) { error = errorDetail(failure); current = error.current || null; }
    finally { busy = false; }
  }
</script>

<form class="editor" bind:this={form} onsubmit={save}>
  {#if !onControls}<div class="editor-actions">
    <button class="primary" type="submit" disabled={busy}>{t(busy ? 'editor.saving' : 'action.save')}</button>
    <button type="button" onclick={onCancel} disabled={busy}>{t('action.cancel')}</button>
    <span class="muted editor-state" role="status">{dirty ? t('editor.pending') : ''}</span>
  </div>{/if}
  <h1 class="workspace-title">{t(initial ? 'editor.title' : 'editor.new')}</h1>
  {#if changedElsewhere}<p class="notice">{t('editor.external')}</p>{/if}
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if current}
    <section class="conflict-panel">
      <h2>{t('editor.latest')}</h2><p>{t('editor.rebaseHint')}</p>
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (This scrollable source must support keyboard scrolling.) -->
      <pre tabindex="0">{current.content}</pre>
      <button type="button" onclick={() => { revision = current!.revision; current = null; error = null; }}>{t('editor.rebase')}</button>
    </section>
  {/if}
  {#if !initial}
    <label for="page-path">{t('editor.path')}</label>
    <p id="path-help" class="field-hint">{t('editor.pathHint')}</p>
    <input id="page-path" bind:value={file} required aria-describedby="path-help" spellcheck="false" />
  {/if}
  <label for="markdown-source">{t('editor.source')}</label>
  <textarea id="markdown-source" bind:value={content} spellcheck="false" autocapitalize="off" disabled={busy}></textarea>
  <label for="change-summary">{t('editor.summary')}</label>
  <input id="change-summary" bind:value={summary} maxlength="500" />
</form>
