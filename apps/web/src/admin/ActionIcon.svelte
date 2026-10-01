<script lang="ts">
  let { name }: { name: 'edit' | 'save' | 'publish' | 'history' | 'move' | 'delete' | 'create' | 'deleted' | 'nox' | 'cancel' } = $props();
  const shapes = {
    edit: 'm16 3 5 5-12 12-6 1 1-6ZM13 6l5 5', save: 'M5 3h12l4 4v14H3V3ZM7 3v6h10V3M7 21v-8h10v8',
    publish: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6', history: 'M3 5v5h5M3 10a9 9 0 1 1 1 8M12 7v5l3 2',
    move: 'M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3',
    delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7', create: 'M14 3H5v18h14V8ZM14 3v5h5M8 14h8m-4-4v8',
    deleted: 'M3 7h18v14H3ZM2 3h20v4H2ZM9 12h6', nox: 'M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4', cancel: 'm6 6 12 12M18 6 6 18'
  };
</script>
<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d={shapes[name]} /></svg>
