<script lang="ts">
  import type { SearchResult } from '../../../../../packages/contracts';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  let { result, basePath, onNavigate }: { result: SearchResult; basePath: string; onNavigate: (path: string, hash: string) => void } = $props();
  const directory = $derived(result.path.split('/').slice(0, -1).join(' / '));
  function follow(event: MouseEvent) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onNavigate(result.path, result.fragment);
  }
</script>
<a class="search-result" href={pageUrl(result.path, basePath) + result.fragment} onclick={follow}>
  <span class="search-result-name">{result.name}</span>
  {#if directory}<span class="search-result-path">{directory}</span>{/if}
  <span class="search-result-excerpt">{#each result.snippet as segment}{#if segment.match}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}</span>
</a>
