<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { ApiError, MutationResult, PageRecord, PageResponse, PublicConfig } from '../../../../packages/contracts';
  import { createTranslator } from '../../../../packages/i18n';
  import { errorDetail } from '../lib/api';
  import { StandaloneRoute } from '../app/route.svelte';
  import AppShell from '../app/AppShell.svelte';
  import CodexReader from '../lib/reader/CodexReader.svelte';
  import MarkdownEditor from './MarkdownEditor.svelte';
  import PageAction from './PageAction.svelte';
  import HistoryView from './HistoryView.svelte';
  import DeletedPages from './DeletedPages.svelte';
  import { AdminClient } from './admin-client';
  import { ImagePicker } from './image-picker';
  import './admin.css';

  let { config }: { config: PublicConfig } = $props();
  const initialConfig = untrack(() => config);
  const t = createTranslator(initialConfig.locale, initialConfig.messages);
  const client = new AdminClient(initialConfig.basePath + '/api');
  const imagePicker = new ImagePicker();
  const route = new StandaloneRoute(initialConfig.basePath);
  let view = $state<'read' | 'edit' | 'history' | 'deleted'>('read');
  let current = $state<PageResponse | null>(null);
  let original = $state<PageRecord | null>(null);
  let historyId = $state('');
  let dirty = $state(false);
  let busy = $state(false);
  let publishing = $state(false);
  let external = $state(false);
  let error = $state<ApiError['error'] | null>(null);
  let notice = $state('');
  let action = $state<'move' | 'delete' | null>(null);
  let refreshKey = $state(0);
  let pickingImage = false;
  async function repairImage(page: PageResponse, occurrence: number) {
    if (pickingImage) return;
    pickingImage = true; error = null; notice = '';
    try {
      const selected = await imagePicker.choose(t, text => notice = text);
      if (!selected) return;
      await client.repairImage(page.id, { ...selected, revision: page.revision, occurrence });
      notice = t('image.saved'); refreshKey++;
    } catch (failure) { error = errorDetail(failure); }
    finally { pickingImage = false; }
  }
  function canLeave() { return !dirty || confirm(t('editor.discard')); }
  function close() { if (canLeave()) { view = 'read'; dirty = false; external = false; } }
  function navigate(path: string, hash?: string, replace?: boolean) {
    if (!replace && !canLeave()) return;
    if (!replace) { view = 'read'; dirty = false; external = false; }
    route.navigate(path, hash, replace);
  }
  async function edit() {
    if (!current || !canLeave()) return;
    busy = true; error = null;
    try { original = await client.original(current.id); view = 'edit'; external = false; notice = ''; }
    catch (failure) { error = errorDetail(failure); }
    finally { busy = false; }
  }
  async function publish(page: PageResponse) {
    if (publishing) return;
    publishing = true; error = null; notice = '';
    try {
      const result = await client.publish(page.id, { revision: page.revision });
      notice = t(result.unchanged ? 'publication.unchanged' : 'publication.saved');
      refreshKey++;
    } catch (failure) { error = errorDetail(failure); }
    finally { publishing = false; }
  }
  function create() { if (canLeave()) { original = null; dirty = false; view = 'edit'; external = false; notice = ''; } }
  function saved(result: MutationResult) {
    dirty = false; action = null; view = 'read'; external = false; error = null;
    notice = t(result.page.deleted ? 'editor.deleted' : result.unchanged ? 'editor.unchanged' : 'editor.saved');
    route.navigate(result.page.deleted ? 'home.md' : result.page.path);
    refreshKey++;
  }
  function history(id: string) { if (canLeave()) { historyId = id; dirty = false; view = 'history'; } }
  onMount(() => route.connect(() => { if (!canLeave()) return false; view = 'read'; dirty = false; return true; }));
</script>

<svelte:window onbeforeunload={event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }} />
{#snippet toolbar(page: PageResponse | null)}
  {#if view === 'read'}
    <button onclick={create}>{t('action.create')}</button>
    <button class="quiet" onclick={() => view = 'deleted'}>{t('action.deleted')}</button>
    <span class="push"></span>
    {#if page}
      <button class="quiet" onclick={() => history(page.id)}>{t('action.history')}</button>
      {#if page.path !== 'home.md'}
        <button class="quiet" onclick={() => action = 'move'} disabled={publishing}>{t('action.move')}</button>
        <button class="quiet" onclick={() => action = 'delete'} disabled={publishing}>{t('action.delete')}</button>
      {/if}
      <span class="publication-actions">
        {#if page.publicationStatus}<span class="publication-status" class:pending={page.publicationStatus !== 'published'}>{t(`publication.${page.publicationStatus}`)}</span>{/if}
        <button onclick={edit} disabled={busy || publishing}>{t('action.edit')}</button>
        <button class="primary" onclick={() => publish(page)} disabled={busy || publishing}>{t(publishing ? 'publication.publishing' : 'action.publish')}</button>
      </span>
    {/if}
  {/if}
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if notice}<p class="save-notice" role="status">{notice}</p>{/if}
  {#if action && current}<PageAction {action} page={current} {client} {t} onDone={saved} onClose={() => action = null} />{/if}
{/snippet}
{#snippet workspace()}
  {#if view === 'edit'}
    {#key original?.id || 'new'}<MarkdownEditor page={original} {client} {t} changedElsewhere={external} onSaved={saved} onCancel={close} onDirty={value => dirty = value} />{/key}
  {:else if view === 'history'}
    {#key historyId}<HistoryView id={historyId} {client} {t} locale={config.locale} onClose={close} />{/key}
  {:else if view === 'deleted'}<DeletedPages {client} {t} onSelect={history} onClose={close} />{/if}
{/snippet}

<AppShell {config} {t} admin onHome={() => navigate('home.md')}>
  <CodexReader apiBase={client.apiBase} basePath={config.basePath} path={route.path} hash={route.hash} {t} {toolbar} {refreshKey}
    onImagePick={repairImage} showLinkWarnings
    body={view === 'read' ? undefined : workspace} onNavigate={navigate}
    onPublication={() => { if (view === 'edit') external = true; }}
    onPage={page => { current = page; document.title = page ? `${page.title} · ${config.brand.name}` : config.brand.name; }} />
</AppShell>
