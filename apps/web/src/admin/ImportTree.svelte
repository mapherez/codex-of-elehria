<script lang="ts">
  import ImportTree from './ImportTree.svelte';
  import type { ImportNoteState } from '../../../../packages/contracts/nox-sync';
  import type { Translator } from '../../../../packages/i18n';
  import Icon from '../lib/Icon.svelte';
  let { paths, selected, onSelect, states = {}, t, expanded, onToggle, prefix = '' }: {
    paths: string[]; selected: string[]; onSelect: (paths: string[], checked: boolean) => void; prefix?: string;
    states: Record<string, ImportNoteState>; t: Translator; expanded: string[]; onToggle: (folder: string, open: boolean) => void;
  } = $props();
  const uid = $props.id();
  const folders = $derived([...new Set(paths.map(file => file.slice(prefix.length).split('/')).filter(parts => parts.length > 1).map(parts => parts[0]!))]);
  const files = $derived(paths.filter(file => !file.slice(prefix.length).includes('/')));
</script>
<ul class="import-tree">
  {#each folders as folder (folder)}
    {@const nested = paths.filter(file => file.startsWith(prefix + folder + '/'))}
    {@const count = nested.filter(file => selected.includes(file)).length}
    <li><details open={expanded.includes(prefix + folder)} ontoggle={event => onToggle(prefix + folder, event.currentTarget.open)}>
      <summary><Icon name="right" size={16} class="tree-chevron" /><label><input type="checkbox" name="folder" checked={count === nested.length} indeterminate={count > 0 && count < nested.length}
        onchange={event => onSelect(nested, event.currentTarget.checked)} /><span>{folder}</span></label></summary>
      <ImportTree paths={nested} {selected} {onSelect} {states} {t} {expanded} {onToggle} prefix={prefix + folder + '/'} />
    </details></li>
  {/each}
  {#each files as file, index (file)}
    {@const state = states[file]}
    {@const description = state ? t(`nox.${state.status}`) + (state.reason ? ': ' + t(state.reason.code, state.reason.params) : '') : ''}
    <li><label title={description}><input type="checkbox" name="note" value={file} checked={selected.includes(file)} aria-describedby={uid + '-state-' + index} onchange={event => onSelect([file], event.currentTarget.checked)} />
      {#if state && ['unchanged', 'conflict', 'blocked'].includes(state.status)}<span class="import-state-dot" class:unchanged={state.status === 'unchanged'} class:problem={state.status === 'conflict' || state.status === 'blocked'} aria-hidden="true"></span>{/if}
      <span>{file.slice(prefix.length).replace(/\.md$/i, '')}</span><span class="import-state-description" id={uid + '-state-' + index}>{description}</span></label></li>
  {/each}
</ul>
