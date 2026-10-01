<script lang="ts">
  import ImportTree from './ImportTree.svelte';
  let { paths, selected, onSelect, prefix = '' }: {
    paths: string[]; selected: string[]; onSelect: (paths: string[], checked: boolean) => void; prefix?: string;
  } = $props();
  const folders = $derived([...new Set(paths.map(file => file.slice(prefix.length).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]!))]);
  const files = $derived(paths.filter(file => !file.slice(prefix.length).includes('/')));
</script>
<ul class="import-tree">
  {#each folders as folder (folder)}
    {@const nested = paths.filter(file => file.startsWith(prefix + folder + '/'))}
    {@const count = nested.filter(file => selected.includes(file)).length}
    <li><details open={prefix === ''}>
      <summary><label><input type="checkbox" name="folder" checked={count === nested.length} indeterminate={count > 0 && count < nested.length}
        onchange={event => onSelect(nested, event.currentTarget.checked)} /><span>{folder}</span></label></summary>
      <ImportTree paths={nested} {selected} {onSelect} prefix={prefix + folder + '/'} />
    </details></li>
  {/each}
  {#each files as file (file)}
    <li><label><input type="checkbox" name="note" value={file} checked={selected.includes(file)} onchange={event => onSelect([file], event.currentTarget.checked)} /><span>{file.slice(prefix.length).replace(/\.md$/i, '')}</span></label></li>
  {/each}
</ul>
