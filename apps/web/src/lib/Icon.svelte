<script lang="ts">
  import { icons, type IconName } from './icons';
  let { name, size = 20, class: className = '' }: { name: IconName; size?: number | string; class?: string } = $props();
  const Component = $derived(icons[name]);
</script>
<Component {size} class={className} aria-hidden="true" weight="regular" />
