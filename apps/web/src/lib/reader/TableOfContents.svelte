<script lang="ts">
  import type { Heading } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  let { headings, active, t, onSelect }: { headings: Heading[]; active: string; t: Translator; onSelect: (id: string) => void } = $props();
</script>

<nav class="toc-links" aria-label={t('toc.title')}>
  <ul>
    {#each headings as heading (heading.id)}
      <li style:--heading-depth={heading.level - 2}>
        <a href={'#' + heading.id} class:active={heading.id === active} aria-current={heading.id === active ? 'location' : undefined}
          onclick={event => { event.preventDefault(); onSelect(heading.id); }}>{heading.text}</a>
      </li>
    {/each}
  </ul>
</nav>
