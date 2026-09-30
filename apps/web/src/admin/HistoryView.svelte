<script lang="ts">
  import { onMount } from 'svelte';
  import type { ApiError, DiffResponse, HistoryEntry, VersionResponse } from '../../../../packages/contracts';
  import type { Translator } from '../../../../packages/i18n';
  import type { AdminClient } from './admin-client';
  import { errorDetail } from '../lib/api';
  let { id, client, t, locale, onClose }: { id: string; client: AdminClient; t: Translator; locale: string; onClose: () => void } = $props();
  let entries = $state<HistoryEntry[]>([]);
  let version = $state<VersionResponse | null>(null);
  let comparison = $state<DiffResponse | null>(null);
  let error = $state<ApiError['error'] | null>(null);
  let loading = $state(true);
  let source = $state(false);
  let from = $state('');
  let to = $state('');
  let selected = $state('');
  let requestId = 0;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  async function show(commit: string) {
    const request = ++requestId;
    loading = true; error = null;
    try {
      const result = await client.version(id, commit);
      if (request !== requestId) return;
      version = result; selected = commit; comparison = null;
    } catch (failure) { if (request === requestId) error = errorDetail(failure); }
    finally { if (request === requestId) loading = false; }
  }
  async function compare() {
    const request = ++requestId;
    loading = true; error = null;
    try {
      const result = await client.diff(id, from, to);
      if (request !== requestId) return;
      comparison = result; version = null;
    } catch (failure) { if (request === requestId) error = errorDetail(failure); }
    finally { if (request === requestId) loading = false; }
  }
  onMount(() => {
    let alive = true;
    void client.history(id).then(result => {
      if (!alive) return;
      entries = result; from = result[1]?.commit || result[0]?.commit || ''; to = result[0]?.commit || '';
      if (to) void show(to); else loading = false;
    }).catch(failure => { if (alive) { error = errorDetail(failure); loading = false; } });
    return () => { alive = false; requestId++; };
  });
</script>

<section class="history-view">
  <div class="workspace-heading"><div><h1 class="workspace-title">{t('history.title')}</h1><p class="muted">{t('history.description')}</p></div><button onclick={onClose}>{t('action.close')}</button></div>
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  <div class="compare-form">
    <label>{t('history.from')}<select bind:value={from}>{#each entries as entry}<option value={entry.commit}>{date(entry.date)} · {entry.commit.slice(0, 7)}</option>{/each}</select></label>
    <label>{t('history.to')}<select bind:value={to}>{#each entries as entry}<option value={entry.commit}>{date(entry.date)} · {entry.commit.slice(0, 7)}</option>{/each}</select></label>
    <button onclick={compare} disabled={!from || !to || loading}>{t('action.compare')}</button>
  </div>
  <ol class="history-list">
    {#each entries as entry (entry.commit)}
      <li class:selected={entry.commit === selected && !comparison}>
        <div><strong>{entry.message.split('\n')[0]}</strong>{#if entry.message.includes('\n')}<p class="history-summary">{entry.message.split('\n').slice(1).join('\n').trim()}</p>{/if}
          <small><time datetime={entry.date}>{date(entry.date)}</time> · {entry.author} · <code>{entry.commit.slice(0, 7)}</code></small></div>
        <button class="quiet" onclick={() => show(entry.commit)} disabled={loading}>{t('history.open')}</button>
      </li>
    {/each}
  </ol>
  {#if loading}<p role="status">{t('app.loading')}</p>{:else if !entries.length}<p>{t('history.empty')}</p>{/if}
  {#if version}
    <div class="version-controls"><code>{version.path}</code><div><button class:primary={source} aria-pressed={source} onclick={() => source = true}>{t('history.source')}</button><button class:primary={!source} aria-pressed={!source} onclick={() => source = false}>{t('history.rendered')}</button></div></div>
    {#if version.deleted}<p class="notice">{t('history.deleted')}</p>{/if}
    {#if source}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex (This scrollable source must support keyboard scrolling.) -->
      <pre class="source-preview" tabindex="0">{version.content}</pre>
    {:else}<article class="prose historical-article">{@html version.html}</article>{/if}
  {/if}
  {#if comparison}
    <p class="muted">{t('history.pathChange', { from: comparison.before.path, to: comparison.after.path })}</p>
    {#if comparison.changes.every(change => !change.added && !change.removed)}<p>{t('history.noDifference')}</p>{/if}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (This scrollable comparison must support keyboard scrolling.) -->
    <div class="diff-view" tabindex="0" role="region" aria-label={t('action.compare')}>
      {#each comparison.changes as change}<pre class:added={change.added} class:removed={change.removed}><span class="diff-sign" aria-label={t(change.added ? 'history.added' : change.removed ? 'history.removed' : 'history.unchanged')}>{change.added ? '+' : change.removed ? '−' : ' '}</span><code>{change.value}</code></pre>{/each}
    </div>
  {/if}
</section>
