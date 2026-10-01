<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ApiError, MutationResult, PageRecord, RenderedMarkdown } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import type { AdminClient } from './admin-client';
  import { errorDetail } from '../lib/api';
  import MarkdownContent from '../lib/reader/MarkdownContent.svelte';
  import Icon from '../lib/Icon.svelte';
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
  let mode = $state<'markdown' | 'rendered'>('markdown');
  let preview = $state<RenderedMarkdown | null>(null);
  let previewError = $state<ApiError['error'] | null>(null);
  let previewLoading = $state(false);
  let previewRequest = 0;
  const uid = $props.id();
  const dirty = $derived(content !== (initial?.content || '') || file !== (initial?.path || '') || Boolean(summary));
  $effect(() => onDirty(dirty));
  $effect(() => { if (form) onControls?.({ save: () => form?.requestSubmit(), busy }); });
  $effect(() => {
    if (mode !== 'rendered') return;
    const input = { id: initial?.id, path: file || undefined, content };
    const request = ++previewRequest;
    let alive = true;
    previewLoading = true; previewError = null;
    void client.preview(input).then(result => { if (alive && request === previewRequest) preview = result; })
      .catch(failure => { if (alive && request === previewRequest) previewError = errorDetail(failure); })
      .finally(() => { if (alive && request === previewRequest) previewLoading = false; });
    return () => { alive = false; };
  });
  onDestroy(() => { previewRequest++; onControls?.(null); });
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
  <div class="editor-view-controls" role="group" aria-label={t('editor.view')}>
    <button type="button" class:active={mode === 'markdown'} aria-pressed={mode === 'markdown'} aria-controls={uid + '-markdown'} onclick={() => mode = 'markdown'}><Icon name="markdown" size={18} />{t('editor.markdown')}</button>
    <button type="button" class:active={mode === 'rendered'} aria-pressed={mode === 'rendered'} aria-controls={uid + '-rendered'} onclick={() => mode = 'rendered'}><Icon name="rendered" size={18} />{t('editor.rendered')}</button>
  </div>
  <div id={uid + '-markdown'} hidden={mode !== 'markdown'}>
    <label for="markdown-source">{t('editor.source')}</label>
    <textarea id="markdown-source" bind:value={content} spellcheck="false" autocapitalize="off" disabled={busy}></textarea>
  </div>
  <div id={uid + '-rendered'} class="editor-preview" hidden={mode !== 'rendered'} aria-busy={previewLoading}>
    {#if previewLoading}<p class="muted" role="status">{t('editor.previewLoading')}</p>
    {:else if previewError}<p class="notice error" role="alert">{t(previewError.code, previewError.params)}</p>
    {:else if preview}<MarkdownContent html={preview.html} apiBase={client.apiBase} basePath={client.apiBase.replace(/\/api\/?$/, '')} {t} />{/if}
  </div>
  <label for="change-summary">{t('editor.summary')}</label>
  <input id="change-summary" bind:value={summary} maxlength="500" />
</form>
