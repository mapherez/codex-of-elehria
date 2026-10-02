<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { ApiError } from '../../../../packages/contracts';
  import type { NoxJob, NoxListing, NoxSettings, NoxVault } from '../../../../packages/contracts/nox-sync';
  import type { Translator } from '../../../../packages/i18n';
  import { errorDetail } from '../lib/api';
  import type { AdminClient } from './admin-client';
  import ImportTree from './ImportTree.svelte';
  import Icon from '../lib/Icon.svelte';
  import './nox-sync.css';

  let { client, t, active, onExit, onImported, onOpen }: {
    client: AdminClient; t: Translator; active: boolean; onExit: () => void;
    onImported: () => void; onOpen: (path: string) => void;
  } = $props();
  const uid = $props.id();
  let stage = $state<'connection' | 'vaults' | 'notes' | 'review'>('connection');
  let connectionReturnStage = $state<'vaults' | 'notes' | 'review' | null>(null);
  let settings = $state<NoxSettings>({ url: '', hasKey: false });
  let url = $state('');
  let apiKey = $state('');
  let vaults = $state<NoxVault[]>([]);
  let vault = $state<NoxVault | null>(null);
  let listing = $state<NoxListing | null>(null);
  let selected = $state<string[]>([]);
  let query = $state('');
  let expanded = $state<string[]>([]);
  let job = $state<NoxJob | null>(null);
  let decisions = $state<Record<string, 'keep' | 'replace'>>({});
  let confirmReplace = $state(false);
  let disconnecting = $state(false);
  let busy = $state(false);
  let error = $state<ApiError['error'] | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const paths = $derived((listing?.files || []).filter(file => /\.md$/i.test(file.path) && file.path.toLowerCase().includes(query.toLowerCase())).map(file => file.path));
  const folders = $derived([...new Set((listing?.files || []).filter(file => /\.md$/i.test(file.path)).flatMap(file => {
    const segments = file.path.split('/'); return segments.slice(0, -1).map((_segment, index) => segments.slice(0, index + 1).join('/'));
  }))]);
  const someExpanded = $derived(expanded.some(folder => folders.includes(folder)));
  const replacing = $derived(Object.values(decisions).includes('replace'));
  const working = $derived(job?.state === 'preparing' || job?.state === 'applying');
  const canGoBack = $derived(stage === 'notes' || stage === 'review' || (stage === 'connection' && settings.hasKey));
  const connectionChanged = $derived(!settings.hasKey || url !== settings.url || apiKey.length > 0);
  const titles = { connection: 'nox.connection', vaults: 'nox.vaults', notes: 'nox.notes', review: 'nox.review' } as const;
  function back() {
    error = null; disconnecting = false;
    if (stage === 'review') stage = 'notes';
    else if (stage === 'notes') stage = 'vaults';
    else if (stage === 'connection' && settings.hasKey) {
      stage = connectionReturnStage || 'vaults'; connectionReturnStage = null;
      url = settings.url; apiKey = '';
    }
  }
  $effect(() => { if (active) untrack(() => { void initialize(); }); });
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    busy = true; error = null;
    try { await action(); } catch (failure) { error = errorDetail(failure); }
    finally { busy = false; }
  }
  async function initialize() {
    await perform(async () => {
      settings = await client.noxSettings(); url = settings.url;
      stage = settings.hasKey ? 'vaults' : 'connection';
      connectionReturnStage = null;
      if (settings.hasKey) vaults = await client.noxVaults();
    });
  }
  async function connect(event: SubmitEvent) {
    event.preventDefault();
    if (!connectionChanged) return;
    await perform(async () => {
      const result = await client.noxConnect({ url, apiKey });
      settings = result.settings; url = settings.url; apiKey = ''; vaults = result.vaults;
      listing = null; vault = null; selected = []; job = null; stage = 'vaults';
      connectionReturnStage = null;
    });
  }
  async function disconnect() {
    await perform(async () => { settings = await client.noxDisconnect(); apiKey = ''; url = ''; vaults = []; listing = null; vault = null; selected = []; expanded = []; job = null; disconnecting = false; connectionReturnStage = null; });
  }
  async function choose(value: NoxVault) {
    await perform(async () => {
      const next = await client.noxFiles(value.vaultId);
      if (value.vaultId !== vault?.vaultId) {
        if (job?.state === 'ready') await client.noxCancel(job.id);
        selected = []; query = ''; job = null;
        expanded = [...new Set(next.files.filter(file => /\.md$/i.test(file.path) && file.path.includes('/')).map(file => file.path.split('/')[0]!))];
      }
      listing = next; vault = value; selected = selected.filter(file => next.files.some(item => item.path === file)); stage = 'notes';
    });
  }
  async function updateListing() {
    if (!vault) return;
    listing = await client.noxFiles(vault.vaultId);
    selected = selected.filter(file => listing!.files.some(item => item.path === file));
  }
  async function refresh() {
    if (!vault) return;
    await perform(updateListing);
  }
  function toggleFolder(folder: string, open: boolean) {
    if (expanded.includes(folder) === open) return;
    expanded = open ? [...expanded, folder] : expanded.filter(value => value !== folder);
  }
  function select(values: string[], checked: boolean) {
    selected = checked ? [...new Set([...selected, ...values])] : selected.filter(file => !values.includes(file));
  }
  async function poll(id: string) {
    try {
      const latest = await client.noxJob(id);
      if (destroyed || job?.id !== id) return;
      job = latest;
      if (latest.state === 'preparing' || latest.state === 'applying') timer = setTimeout(() => { void poll(id); }, 700);
    } catch (failure) { if (!destroyed) error = errorDetail(failure); }
  }
  async function prepare() {
    if (!listing || !selected.length) return;
    await perform(async () => {
      if (job && (job.state === 'preparing' || job.state === 'ready')) await client.noxCancel(job.id);
      clearTimeout(timer);
      job = await client.noxPrepare(listing!.listingId, selected); decisions = {}; confirmReplace = false; stage = 'review';
      void poll(job.id);
    });
  }
  async function cancel() {
    if (!job) return;
    await perform(async () => { job = await client.noxCancel(job!.id); clearTimeout(timer); });
  }
  async function apply() {
    if (!job) return;
    await perform(async () => {
      job = { ...job!, state: 'applying' };
      try { job = await client.noxApply(job.id, decisions, confirmReplace); }
      catch (failure) { job = { ...job, state: 'ready' }; throw failure; }
      onImported(); await updateListing();
    });
  }
  onDestroy(() => { destroyed = true; clearTimeout(timer); });
</script>

<div class="nox-panel" class:selecting={stage === 'notes' || stage === 'review'} aria-busy={busy}>
  <div class="nox-shortcuts">
    <div class="nox-step-heading"><button type="button" class="quiet nox-step-back" onclick={back} aria-label={t('nox.backStep')} title={t('nox.backStep')} disabled={!canGoBack || busy || working}><Icon name="left" size={18} /></button><h3>{t(titles[stage])}</h3></div>
    {#if settings.hasKey && stage !== 'connection'}<button type="button" class="quiet nox-settings" onclick={() => { connectionReturnStage = stage as 'vaults' | 'notes' | 'review'; stage = 'connection'; error = null; }} aria-label={t('nox.settings')} title={t('nox.settings')} disabled={busy || working}><Icon name="settings" /></button>{/if}
  </div>
  <p class="nox-intro">{t('nox.description')}</p>
  {#if stage !== 'connection'}
  <ol class="import-steps" aria-label={t('nox.title')}>
    {#each ['vaults', 'notes', 'review'] as step, index}<li class:current={stage === step}><button type="button" class="quiet" aria-current={stage === step ? 'step' : undefined} disabled={busy || (step === 'notes' && !listing) || (step === 'review' && !job)} onclick={() => stage = step as typeof stage}><span>{index + 1}</span>{t(titles[step as keyof typeof titles])}</button></li>{/each}
  </ol>
  {/if}
  {#if error}<p class="notice error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if stage === 'connection'}
    <form class="drawer-form" method="post" action={client.apiBase + '/admin/nox/connection'} onsubmit={connect}>
      <label for={uid + '-url'}>{t('nox.url')}</label>
      <input id={uid + '-url'} name="url" type="url" bind:value={url} required aria-describedby={uid + '-url-hint'} />
      <p id={uid + '-url-hint'} class="field-hint">{t('nox.urlHint')}</p>
      <label for={uid + '-key'}>{t('nox.key')}</label>
      <input id={uid + '-key'} name="apiKey" type="password" bind:value={apiKey} placeholder={settings.hasKey && url === settings.url ? t('nox.savedKeyPlaceholder') : undefined} required={!settings.hasKey || url !== settings.url} autocomplete="off" aria-describedby={settings.hasKey ? uid + '-key-hint' : undefined} />
      {#if settings.hasKey}<p id={uid + '-key-hint'} class="field-hint">{t('nox.keyHint')}</p>{/if}
      <div class="import-footer"><button type="submit" class="primary" disabled={busy || working || !connectionChanged}>{t(busy ? 'nox.connecting' : 'nox.connect')}</button></div>
    </form>
    {#if settings.hasKey}
      {#if disconnecting}<div class="import-warning"><p>{t('nox.disconnectHint')}</p><button class="danger" onclick={disconnect} disabled={busy || working}>{t('nox.disconnect')}</button><button class="quiet" onclick={() => disconnecting = false}>{t('action.cancel')}</button></div>
      {:else}<button class="quiet danger" onclick={() => disconnecting = true} disabled={busy || working}>{t('nox.disconnect')}</button>{/if}
    {/if}
  {:else if stage === 'vaults'}
    {#if job && (job.state === 'preparing' || job.state === 'applying')}<button class="import-resume" onclick={() => stage = 'review'}>{t(job.state === 'preparing' ? 'nox.preparing' : 'nox.applying')}</button>{/if}
    <div class="vault-list">{#each vaults as value (value.vaultId)}<button class="action-row" onclick={() => choose(value)} disabled={busy || working}><span>{value.name}</span><Icon name="right" /></button>{:else}<p class="muted">{t('nox.noVaults')}</p>{/each}</div>
  {:else if stage === 'notes'}
    <p class="vault-context">{vault?.name}</p>
    {#if job && job.state !== 'cancelled'}<button class="import-resume" onclick={() => stage = 'review'}>{t(job.state === 'done' ? 'nox.complete' : job.state === 'preparing' ? 'nox.preparing' : 'nox.review')}</button>{/if}
    <label class="filter-label" for={uid + '-search'}>{t('nox.search')}</label><input id={uid + '-search'} type="search" name="search" bind:value={query} />
    <div class="import-list-controls"><label class="select-all"><input type="checkbox" name="all" checked={paths.length > 0 && paths.every(file => selected.includes(file))} indeterminate={paths.some(file => selected.includes(file)) && !paths.every(file => selected.includes(file))} onchange={event => select(paths, event.currentTarget.checked)} />{t('nox.selectAll')}</label>
      <button type="button" class="quiet expand-folders" disabled={!folders.length} aria-label={t(someExpanded ? 'nox.collapseAll' : 'nox.expandAll')} title={t(someExpanded ? 'nox.collapseAll' : 'nox.expandAll')} onclick={() => expanded = someExpanded ? [] : [...folders]}>
        <Icon name={someExpanded ? 'collapse' : 'expand'} />
      </button></div>
    <div class="import-state-legend"><span><i class="import-state-dot unchanged" aria-hidden="true"></i>{t('nox.stateUnchanged')}</span><span><i class="import-state-dot problem" aria-hidden="true"></i>{t('nox.stateProblem')}</span></div>
    {#if paths.length && listing}<ImportTree {paths} {selected} onSelect={select} states={listing.notes} {t} {expanded} onToggle={toggleFolder} />{:else}<p class="muted">{t('nox.noNotes')}</p>{/if}
    <div class="import-footer"><p role="status">{t('nox.selected', { count: selected.length })}</p><button class="primary" onclick={prepare} disabled={busy || !selected.length || job?.state === 'applying'}>{t('nox.prepare')}</button><button class="quiet" onclick={refresh} disabled={busy}>{t('nox.refresh')}</button></div>
  {:else if stage === 'review' && job}
    {#if job.state === 'preparing' || job.state === 'applying'}
      <div class="import-progress" role="status"><h3>{t(job.state === 'applying' ? 'nox.applying' : 'nox.preparing')}</h3><progress value={job.completed} max={Math.max(1, job.total)}></progress><p>{t('nox.progress', { completed: job.completed, total: job.total })}</p></div>
      {#if job.state === 'preparing'}<button class="quiet" onclick={cancel} disabled={busy}>{t('action.cancel')}</button>{/if}
    {:else if job.state === 'failed'}
      <p class="notice error" role="alert">{job.error ? t(job.error.code, job.error.params) : t('error.noxConnection')}</p>
      <button onclick={() => { stage = 'notes'; void refresh(); }}>{t('nox.refresh')}</button>
    {:else if job.state === 'cancelled'}<p role="status">{t('nox.cancelled')}</p><button onclick={() => stage = 'notes'}>{t('action.back')}</button>
    {:else if job.state === 'done'}
      <div class="import-success" role="status"><h3>{t('nox.complete')}</h3><p>{t('nox.result', { count: job.result?.length || 0 })}</p></div>
      <ul class="import-results">{#each job.result || [] as result (result.id)}<li><span>{result.path}</span><button class="quiet" onclick={() => onOpen(result.path)}>{t('nox.open')}</button></li>{/each}</ul>
      <div class="import-footer"><button class="primary" onclick={onExit}>{t('nox.actions')}</button><button class="quiet" onclick={() => { stage = 'notes'; void refresh(); }}>{t('nox.again')}</button></div>
    {:else}
      <div class="import-reviews">{#each job.reviews as review (review.path)}
        <article class="import-review" class:conflict={review.status === 'conflict'}>
          <header><strong>{review.targetPath}</strong><span class="import-status">{t(`nox.${review.status}`)}</span></header>
          {#if review.reason}<p class="notice error">{t(review.reason.code, review.reason.params)}</p>{/if}
          {#each review.warnings as warning}<p class="import-warning">{t(warning.reason === 'missing' ? 'image.missing' : 'image.ambiguous', { name: warning.reference })}</p>{/each}
          {#if review.status === 'conflict'}
            <details><summary>{t('action.compare')}</summary><h4>{t('nox.local')}</h4><pre>{review.localContent}</pre><h4>{t('nox.remote')}</h4><pre>{review.remoteContent}</pre></details>
            <fieldset><legend>{t('nox.conflict')}</legend>
              <label><input type="radio" name={uid + review.path} checked={decisions[review.path] !== 'replace'} onchange={() => { decisions[review.path] = 'keep'; confirmReplace = false; }} />{t('nox.keep')}</label>
              <label><input type="radio" name={uid + review.path} checked={decisions[review.path] === 'replace'} onchange={() => { decisions[review.path] = 'replace'; confirmReplace = false; }} />{t('nox.replace')}</label>
            </fieldset>
          {/if}
        </article>
      {/each}</div>
      {#if replacing}<label class="replacement-confirm"><input type="checkbox" name="confirmReplace" bind:checked={confirmReplace} />{t('nox.confirmReplace')}</label>{/if}
      <div class="import-footer"><p class="muted">{t('nox.private')}</p><button class="primary" onclick={apply} disabled={busy || (replacing && !confirmReplace) || !job.reviews.some(review => review.status !== 'blocked')}>{t('nox.apply')}</button></div>
    {/if}
  {/if}
</div>
