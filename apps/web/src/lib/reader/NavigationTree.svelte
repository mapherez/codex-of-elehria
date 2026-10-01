<script lang="ts">
  import type { NavigationNode } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  import Icon from '../Icon.svelte';
  let { nodes, activePath, basePath, t, onNavigate }: {
    nodes: NavigationNode[]; activePath: string; basePath: string; t: Translator;
    onNavigate: (path: string) => void;
  } = $props();
  let expanded = $state<Record<string, boolean>>({});
  $effect(() => {
    const parts = activePath.split('/');
    for (let i = 1; i < parts.length; i++) expanded[parts.slice(0, i).join('/')] = true;
  });
  function follow(event: MouseEvent, path: string) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(path);
  }
</script>

{#snippet tree(items: NavigationNode[])}
  <ul class="tree-list">
    {#each items as node (node.path)}
      <li>
        {#if node.type === 'folder'}
          <details open={expanded[node.path] ?? false} ontoggle={event => expanded[node.path] = event.currentTarget.open}>
            <summary><Icon name="right" size={14} class="tree-chevron" /><span>{node.name}</span></summary>
            {@render tree(node.children)}
          </details>
        {:else}
          <a class:active={activePath === node.path} aria-current={activePath === node.path ? 'page' : undefined}
            href={pageUrl(node.path, basePath)} onclick={event => follow(event, node.path)}>
            <span class="page-dot" aria-hidden="true"></span>{node.name}
          </a>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<nav aria-label={t('nav.label')}>
  {#if nodes.length}{@render tree(nodes)}{:else}<p class="muted nav-empty">{t('nav.empty')}</p>{/if}
</nav>
