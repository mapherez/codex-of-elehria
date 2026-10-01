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
  const uid = $props.id();
  const navigationId = uid + '-navigation';
  let navigationOpen = $state(false);
  let actionsOpen = $state(false);
  let pendingAction: (() => void) | null = null;
  let editorControls = $state<{ save: () => void; busy: boolean } | null>(null);
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
  function runAction(next: () => void) { pendingAction = next; actionsOpen = false; }
  function actionsClosed() { const next = pendingAction; pendingAction = null; next?.(); }
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
{#snippet actions()}
  <div class="admin-actions">
    {#if current && !(view === 'edit' && !original)}
      <div class="drawer-page-context"><span>{current.path.replace(/\.md$/i, '').split('/').join(' / ')}</span>
        {#if view === 'edit' && dirty}<span class="publication-status pending">{t('editor.pending')}</span>
        {:else if current.publicationStatus}<span class="publication-status" class:pending={current.publicationStatus !== 'published'}>{t(`publication.${current.publicationStatus}`)}</span>{/if}
      </div>
    {/if}
    {#if view === 'edit'}
      <div class="drawer-action-group">
        <button class="primary" onclick={() => { const controls = editorControls; if (controls) runAction(controls.save); }} disabled={!editorControls || editorControls.busy}>{t(editorControls?.busy ? 'editor.saving' : 'action.save')}</button>
        <button onclick={() => runAction(close)} disabled={editorControls?.busy}>{t('action.cancel')}</button>
      </div>
    {:else if view !== 'read'}
      <div class="drawer-action-group"><button onclick={() => runAction(close)}>{t('action.close')}</button></div>
    {/if}
    {#if current && view === 'read'}
      <div class="drawer-action-group">
        <button onclick={() => runAction(() => { void edit(); })} disabled={busy || publishing}>{t('action.edit')}</button>
        <button class="primary" onclick={() => { const page = current; if (page) runAction(() => { void publish(page); }); }} disabled={busy || publishing}>{t(publishing ? 'publication.publishing' : 'action.publish')}</button>
        <button onclick={() => { const page = current; if (page) runAction(() => history(page.id)); }}>{t('action.history')}</button>
        {#if current.path !== 'home.md'}
          <button onclick={() => runAction(() => action = 'move')} disabled={publishing}>{t('action.move')}</button>
          <button class="danger" onclick={() => runAction(() => action = 'delete')} disabled={publishing}>{t('action.delete')}</button>
        {/if}
      </div>
    {/if}
    <div class="drawer-action-group">
      <button onclick={() => runAction(create)} disabled={editorControls?.busy || publishing}>{t('action.create')}</button>
      <button onclick={() => runAction(() => { if (canLeave()) { view = 'deleted'; dirty = false; } })} disabled={editorControls?.busy || publishing}>{t('action.deleted')}</button>
    </div>
  </div>
{/snippet}
{#snippet toolbar(_page: PageResponse | null)}
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if notice}<p class="save-notice" role="status">{notice}</p>{/if}
  {#if action && current}<PageAction {action} page={current} {client} {t} onDone={saved} onClose={() => action = null} />{/if}
{/snippet}
{#snippet workspace()}
  {#if view === 'edit'}
    {#key original?.id || 'new'}<MarkdownEditor page={original} {client} {t} changedElsewhere={external} onSaved={saved} onCancel={close} onDirty={value => dirty = value} onControls={controls => editorControls = controls} />{/key}
  {:else if view === 'history'}
    {#key historyId}<HistoryView id={historyId} {client} {t} locale={config.locale} onClose={close} showClose={false} />{/key}
  {:else if view === 'deleted'}<DeletedPages {client} {t} onSelect={history} onClose={close} showClose={false} />{/if}
{/snippet}

<AppShell {config} {t} {navigationId} bind:navigationOpen bind:actionsOpen {actions} onActionsClosed={actionsClosed} onHome={() => navigate('home.md')}>
  <CodexReader apiBase={client.apiBase} basePath={config.basePath} path={route.path} hash={route.hash} {t} toolbar={error || notice || action ? toolbar : undefined} {refreshKey}
    onImagePick={repairImage} showLinkWarnings
    {navigationId} bind:navigationOpen
    body={view === 'read' ? undefined : workspace} onNavigate={navigate}
    onPublication={() => { if (view === 'edit') external = true; }}
    onPage={page => { current = page; document.title = page ? `${page.title} · ${config.brand.name}` : config.brand.name; }} />
</AppShell>
