<script lang="ts">
  import Icon from '../lib/Icon.svelte';
  let { name }: { name: 'edit' | 'save' | 'publish' | 'history' | 'move' | 'delete' | 'create' | 'deleted' | 'nox' | 'cancel' } = $props();
</script>
<Icon {name} />
