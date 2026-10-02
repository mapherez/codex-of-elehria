<script lang="ts">
  import { untrack } from 'svelte';
  import type { ApiError, PageResponse, RelationshipEdge, RelationshipNode, RelationshipsResponse } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  import { WikiClient, errorDetail } from '../api';
  import Icon from '../Icon.svelte';
  import { GraphCanvas } from './graph-canvas';
  import type { GraphPoint } from './graph-types';
  import './relationships.css';

  let { page, apiBase, basePath, t, onNavigate }: {
    page: PageResponse; apiBase: string; basePath: string; t: Translator;
    onNavigate: (path: string, hash?: string) => void;
  } = $props();
  const uid = $props.id();
  let visible = $state(false);
  let response = $state.raw<RelationshipsResponse | null>(null);
  let loading = $state(false); let error = $state<ApiError['error'] | null>(null);
  let graphFailed = $state(false); let settled = $state(false);
  let requestKey = $state(0); let previousPath = '';
  let canvas = $state<HTMLCanvasElement>(); let controller = $state.raw<GraphCanvas>();
  let hovered = $state<GraphPoint | null>(null);
  const nodes = $derived(new Map(response?.nodes.map(node => [node.id, node])));
  const outgoing = $derived((response?.edges.filter(edge => edge.sourceId === response?.centerId) || []).sort((a, b) => nodes.get(a.targetId)!.path.localeCompare(nodes.get(b.targetId)!.path)));
  const incoming = $derived((response?.edges.filter(edge => edge.targetId === response?.centerId) || []).sort((a, b) => nodes.get(a.sourceId)!.path.localeCompare(nodes.get(b.sourceId)!.path)));
  const warnings = $derived(response?.unresolved || []);
  const center = $derived(response ? nodes.get(response.centerId) : undefined);

  function observe(element: HTMLElement) {
    const observer = new ResizeObserver(() => visible = element.getBoundingClientRect().width > 0);
    observer.observe(element);
    return { destroy: () => observer.disconnect() };
  }
  $effect(() => {
    const path = page.path; page.publication; requestKey;
    if (!visible) return;
    if (path !== previousPath) { response = null; previousPath = path; }
    error = null; loading = true; graphFailed = false;
    const abort = new AbortController();
    void new WikiClient(apiBase).relationships(path, abort.signal)
      .then(value => { if (!abort.signal.aborted) response = value; })
      .catch(failure => { if (!abort.signal.aborted) error = errorDetail(failure); })
      .finally(() => { if (!abort.signal.aborted) loading = false; });
    return () => abort.abort();
  });
  $effect(() => {
    const element = canvas;
    if (!element || !visible || graphFailed) return;
    let view: GraphCanvas;
    try {
      view = untrack(() => new GraphCanvas(element, {
        navigate: path => onNavigate(path),
        hover: point => hovered = point,
        settled: value => settled = value,
        failed: () => graphFailed = true
      }));
      controller = view;
    } catch { graphFailed = true; return; }
    return () => { view.destroy(); controller = undefined; hovered = null; };
  });
  $effect(() => {
    const value = response; const view = controller;
    if (value && view) untrack(() => view.update(value));
  });
  function follow(event: MouseEvent, path: string, fragment = '') {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(path, fragment);
  }
</script>

<section class="relationships-panel" use:observe>
  <div class="relationships-heading">
    <h2>{t('relationships.title')}</h2>
    <div class="graph-controls">
      <button type="button" aria-label={t('relationships.zoomOut')} title={t('relationships.zoomOut')} disabled={!controller} onclick={() => controller?.scale(1 / 1.5)}><Icon name="zoomOut" size={15} /></button>
      <button type="button" aria-label={t('relationships.zoomIn')} title={t('relationships.zoomIn')} disabled={!controller} onclick={() => controller?.scale(1.5)}><Icon name="zoomIn" size={15} /></button>
      <button type="button" aria-label={t('relationships.fit')} title={t('relationships.fit')} disabled={!controller} onclick={() => controller?.fit()}><Icon name="fit" size={15} /></button>
    </div>
  </div>
  <div class="relationship-graph" data-layout-state={settled ? 'settled' : 'running'}>
    {#if response && !graphFailed}
      <canvas bind:this={canvas} aria-label={t('relationships.chart', { name: center?.name || page.title })} aria-describedby={uid + '-description'}></canvas>
    {:else}
      <p class="muted">{t(graphFailed ? 'relationships.graphUnavailable' : error ? error.code : 'app.loading', error?.params)}</p>
    {/if}
  </div>
  <p id={uid + '-description'} class="graph-description">{t('relationships.description')}</p>
  <div class="graph-caption" aria-hidden="true" title={hovered?.path || hovered?.name || center?.path}>
    {#if hovered?.warning}<Icon name="warning" size={12} />{/if}
    <span>{hovered?.name || center?.name || page.title}</span>
  </div>
  {#if error && response}<p class="relationship-error" role="alert">{t(error.code, error.params)}</p>{/if}
  {#if error || graphFailed}<button type="button" class="quiet relationship-retry" onclick={() => requestKey++}>{t('action.retry')}</button>{/if}
  {#if response}
    {#if !outgoing.length && !incoming.length && !warnings.length}<p class="relationship-empty">{t('relationships.empty')}</p>{/if}
    <details class="relationship-details">
      <summary><Icon name="right" size={13} class="tree-chevron" /><span>{t('relationships.details')}</span></summary>
      <p class="relationship-count" aria-live="polite" aria-busy={loading}>{t('relationships.count', { outgoing: outgoing.length, incoming: incoming.length })}</p>
      {@render group(t('relationships.links'), outgoing, true)}
      {@render group(t('relationships.backlinks'), incoming, false)}
      {#if warnings.length}
        <h3>{t('relationships.unresolved')}</h3>
        <ul class="relationship-warnings" role="list">
          {#each warnings as problem (problem.reference + problem.reason)}
            <li><Icon name="warning" size={13} /><span>{t(`link.${problem.reason}`, { name: problem.reference })}</span></li>
          {/each}
        </ul>
      {/if}
    </details>
  {/if}
</section>

{#snippet noteLink(node: RelationshipNode, fragment = '', label = node.name)}
  <a href={pageUrl(node.path, basePath) + fragment} title={node.path.replace(/\.md$/i, '')} onfocus={() => controller?.highlight(node.id)} onblur={() => controller?.highlight()}
    onclick={event => follow(event, node.path, fragment)}>{label}</a>
{/snippet}
{#snippet group(title: string, edges: RelationshipEdge[], outbound: boolean)}
  <h3>{title}</h3>
  {#if edges.length}
    <ul class="relationship-list" role="list">
      {#each edges as edge (edge.sourceId + ':' + edge.targetId)}
        {@const node = nodes.get(outbound ? edge.targetId : edge.sourceId)!}
        <li>
          {@render noteLink(node)}
          {#if edge.destinations.some(destination => destination.fragment)}
            <ul class="relationship-headings" role="list">
              {#each edge.destinations.filter(destination => destination.fragment) as destination (destination.fragment)}
                <li>
                  {#if outbound}
                    {@render noteLink(node, destination.fragment, destination.heading || destination.fragment.slice(1))}
                  {:else if center}
                    {@render noteLink(center, destination.fragment, t('relationships.intoHeading', { heading: destination.heading || destination.fragment.slice(1) }))}
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}<p class="relationship-empty">{t('relationships.none')}</p>{/if}
{/snippet}
