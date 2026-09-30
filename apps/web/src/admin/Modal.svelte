<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Translator } from '../../../../packages/i18n';
  let { title, t, onClose, children }: { title: string; t: Translator; onClose: () => void; children: Snippet } = $props();
  const uid = $props.id();
  let dialog: HTMLDialogElement;
  onMount(() => { dialog.showModal(); });
</script>

<dialog class="admin-dialog" bind:this={dialog} aria-labelledby={uid} oncancel={onClose}>
  <div class="dialog-heading"><h2 id={uid}>{title}</h2><button type="button" class="quiet" onclick={onClose} aria-label={t('action.close')}>×</button></div>
  {@render children()}
</dialog>
