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
  import ActionIcon from './ActionIcon.svelte';
  import SearchPage from '../lib/search/SearchPage.svelte';
  import NoxSyncPanel from './NoxSyncPanel.svelte';
  import PublishPending from './PublishPending.svelte';
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
  let view = $state<'read' | 'edit'>('read');
  let drawerView = $state<'actions' | 'history' | 'deleted' | 'move' | 'delete' | 'nox' | 'publish'>('actions');
  const drawerTitle = $derived(t(drawerView === 'publish' ? 'publication.batchTitle' : drawerView === 'nox' ? 'nox.title' : drawerView === 'history' ? 'history.title' : drawerView === 'deleted' ? 'history.removedTitle' : drawerView === 'move' ? 'move.title' : drawerView === 'delete' ? 'delete.title' : 'admin.actions'));
  let current = $state<PageResponse | null>(null);
  let original = $state<PageRecord | null>(null);
  let historyId = $state('');
  let historyParent = $state<'actions' | 'deleted'>('actions');
  let dirty = $state(false);
  let busy = $state(false);
  let publishing = $state(false);
  let external = $state(false);
  let error = $state<ApiError['error'] | null>(null);
  let notice = $state('');
  let refreshKey = $state(0);
  let searchRefreshKey = $state(0);
  $effect(() => { if (route.search !== null) document.title = t('search.title') + ' · ' + config.brand.name; });
  let pickingImage = false;
  function runAction(next: () => void) {
    if (matchMedia('(min-width: 1025px)').matches) next();
    else { pendingAction = next; actionsOpen = false; }
  }
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
    if (!replace && !canLeave()) return false;
    if (!replace) { view = 'read'; dirty = false; external = false; }
    route.navigate(path, hash, replace); return true;
  }
  function search(query: string) {
    if (!canLeave()) return false;
    view = 'read'; dirty = false; external = false; actionsOpen = false; navigationOpen = false;
    route.navigateSearch(query); return true;
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
    dirty = false; drawerView = 'actions'; view = 'read'; external = false; error = null;
    notice = t(result.page.deleted ? 'editor.deleted' : result.unchanged ? 'editor.unchanged' : 'editor.saved');
    route.navigate(result.page.deleted ? 'home.md' : result.page.path);
    refreshKey++;
  }
  function history(id: string) { if (canLeave()) { historyParent = drawerView === 'deleted' ? 'deleted' : 'actions'; historyId = id; drawerView = 'history'; } }
  onMount(() => route.connect(() => { if (!canLeave()) return false; view = 'read'; dirty = false; return true; }));
</script>

<svelte:window onbeforeunload={event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }} />
{#snippet actionButton(name: 'edit' | 'save' | 'publish' | 'history' | 'move' | 'delete' | 'create' | 'deleted' | 'nox' | 'cancel', label: string, handler: () => void, disabled = false, primary = false, danger = false)}
  <button class="action-row" class:primary class:danger {disabled} onclick={handler}><ActionIcon {name} /><span>{label}</span></button>
{/snippet}
{#snippet feedback()}
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if notice}<p class="save-notice" role="status">{notice}</p>{/if}
{/snippet}
{#snippet actions()}
  {#if actionsOpen}{@render feedback()}{/if}
  <div hidden={drawerView !== 'nox'}><NoxSyncPanel {client} {t} active={drawerView === 'nox'} onExit={() => drawerView = 'actions'}
    onImported={() => refreshKey++}
    onOpen={path => runAction(() => navigate(path))} /></div>
  {#if drawerView === 'history'}
    {#key historyId}<HistoryView id={historyId} {client} {t} locale={config.locale} onClose={() => drawerView = 'actions'} showClose={false} />{/key}
  {:else if drawerView === 'deleted'}<DeletedPages {client} {t} onSelect={history} onClose={() => drawerView = 'actions'} showClose={false} />
  {:else if drawerView === 'publish'}<PublishPending {client} {t} onPublished={() => refreshKey++} />
  {:else if (drawerView === 'move' || drawerView === 'delete') && current}
    {#key drawerView}<PageAction action={drawerView} page={current} {client} {t} onDone={saved} onClose={() => drawerView = 'actions'} />{/key}
  {:else if drawerView === 'actions'}
  <div class="admin-actions">
    {#if current && !(view === 'edit' && !original)}
      <div class="drawer-page-context"><span>{current.path.replace(/\.md$/i, '').split('/').join(' / ')}</span>
        {#if view === 'edit' && dirty}<span class="publication-status pending">{t('editor.pending')}</span>
        {:else if current.publicationStatus}<span class="publication-status" class:pending={current.publicationStatus !== 'published'}>{t(`publication.${current.publicationStatus}`)}</span>{/if}
      </div>
    {/if}
    {#if view === 'edit'}
      {#if !original && dirty}<p class="publication-status pending">{t('editor.pending')}</p>{/if}
      <div class="drawer-action-group">
        <h3>{t('admin.pageActions')}</h3>
        {@render actionButton('save', t(editorControls?.busy ? 'editor.saving' : 'action.save'), () => { const controls = editorControls; if (controls) runAction(controls.save); }, !editorControls || editorControls.busy, true)}
        {@render actionButton('cancel', t('action.cancel'), () => runAction(close), editorControls?.busy)}
      </div>
    {/if}
    {#if current && view === 'read'}
      <div class="drawer-action-group">
        <h3>{t('admin.pageActions')}</h3>
        {@render actionButton('edit', t('action.edit'), () => runAction(() => { void edit(); }), busy || publishing)}
        {@render actionButton('publish', t(publishing ? 'publication.publishing' : 'action.publish'), () => { const page = current; if (page) void publish(page); }, busy || publishing, true)}
        {@render actionButton('history', t('action.history'), () => { if (current) history(current.id); })}
        {#if current.path !== 'home.md'}
          {@render actionButton('move', t('action.move'), () => drawerView = 'move', publishing)}
          {@render actionButton('delete', t('action.delete'), () => drawerView = 'delete', publishing, false, true)}
        {/if}
      </div>
    {/if}
    <div class="drawer-action-group">
      <h3>{t('admin.serverActions')}</h3>
      {@render actionButton('create', t('action.create'), () => runAction(create), editorControls?.busy || publishing)}
      {@render actionButton('deleted', t('action.deleted'), () => { if (canLeave()) drawerView = 'deleted'; }, editorControls?.busy || publishing)}
      {@render actionButton('nox', t('nox.title'), () => { drawerView = 'nox'; }, editorControls?.busy || publishing)}
      {@render actionButton('publish', t('publication.batchTitle'), () => { if (canLeave()) { view = 'read'; dirty = false; external = false; drawerView = 'publish'; } }, editorControls?.busy || publishing)}
    </div>
  </div>
  {/if}
{/snippet}
{#snippet toolbar(_page: PageResponse | null)}
  {#if !actionsOpen}{@render feedback()}{/if}
{/snippet}
{#snippet workspace()}
  {#if view === 'edit'}
    {#key original?.id || 'new'}<MarkdownEditor page={original} {client} {t} changedElsewhere={external} onSaved={saved} onCancel={close} onDirty={value => dirty = value} onControls={controls => editorControls = controls} />{/key}
  {/if}
{/snippet}

{#snippet searchResults()}
  <SearchPage apiBase={client.apiBase} basePath={config.basePath} query={route.search || ''} {t} refreshKey={searchRefreshKey + refreshKey}
    onNavigate={navigate} onSearch={search} />
{/snippet}

<AppShell searchQuery={route.search ?? undefined} searchRefreshKey={searchRefreshKey + refreshKey} onSearch={search} onSearchNavigate={navigate} {config} {t} {navigationId} bind:navigationOpen bind:actionsOpen {actions} onActionsClosed={actionsClosed} onHome={() => navigate('home.md')}
  actionsPending={view === 'edit' && dirty} actionsTitle={drawerTitle} actionsWide={drawerView === 'nox' || drawerView === 'history'} onActionsBack={drawerView === 'actions' ? undefined : () => { drawerView = drawerView === 'history' ? historyParent : 'actions'; }}>
  <CodexReader apiBase={client.apiBase} basePath={config.basePath} path={route.path} hash={route.hash} {t} toolbar={(error || notice) && !actionsOpen ? toolbar : undefined} {refreshKey}
    onImagePick={repairImage} showLinkWarnings
    {navigationId} bind:navigationOpen
    body={view === 'edit' ? workspace : route.search === null ? undefined : searchResults} onNavigate={navigate}
    onPublication={() => { if (view === 'edit') external = true; searchRefreshKey++; }}
    onPage={page => { current = route.search === null ? page : null; if (route.search !== null) return; document.title = page ? `${page.title} · ${config.brand.name}` : config.brand.name; }} />
</AppShell>
