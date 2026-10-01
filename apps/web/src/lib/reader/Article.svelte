<script lang="ts">
  import type { PageResponse } from '../../../../../packages/contracts';
  import type { Translator } from '../../../../../packages/i18n';
  import MarkdownContent from './MarkdownContent.svelte';
  let { page, basePath, apiBase, onNavigate, onHeading, onElement, onImagePick, t }: {
    page: PageResponse; basePath: string; apiBase: string; t: Translator;
    onImagePick?: (page: PageResponse, occurrence: number) => Promise<void>;
    onNavigate: (path: string, hash?: string) => void; onHeading: (id: string) => void;
    onElement: (element: HTMLElement) => void;
  } = $props();
</script>
<MarkdownContent html={page.html} {basePath} {apiBase} {t} {onNavigate} {onHeading} {onElement}
  onImagePick={onImagePick ? occurrence => onImagePick!(page, occurrence) : undefined} />
