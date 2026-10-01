<script lang="ts">
  import { mount, unmount } from 'svelte';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  import type { Translator } from '../../../../../packages/i18n';
  import Icon from '../Icon.svelte';
  let { html, basePath, apiBase, onNavigate, onHeading, onElement, onImagePick, t }: {
    html: string; basePath: string; apiBase: string; t: Translator;
    onNavigate?: (path: string, hash?: string) => void; onHeading?: (id: string) => void;
    onElement?: (element: HTMLElement) => void; onImagePick?: (occurrence: number) => Promise<void>;
  } = $props();
  let article: HTMLElement;
  $effect(() => {
    html;
    if (!article) return;
    const mounted: ReturnType<typeof mount>[] = [];
    article.querySelectorAll<HTMLAnchorElement>('a[data-page-path]').forEach(anchor => {
      anchor.href = pageUrl(anchor.dataset.pagePath!, basePath) + (anchor.dataset.pageSuffix || '');
    });
    article.querySelectorAll<HTMLElement>('[data-media-path]').forEach(element => {
      const url = apiBase.replace(/\/api\/?$/, '') + '/media/' + element.dataset.mediaPath!.split('/').map(encodeURIComponent).join('/');
      element.setAttribute(element.tagName === 'IMG' ? 'src' : 'href', url);
    });
    if (onImagePick) article.querySelectorAll<HTMLElement>('span[data-image-index]').forEach(placeholder => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'image-repair';
      button.dataset.imageIndex = placeholder.dataset.imageIndex;
      const label = t('image.choose', { name: placeholder.dataset.imageName || '' });
      button.setAttribute('aria-label', label); button.title = label;
      placeholder.replaceWith(button);
    });
    article.querySelectorAll<HTMLElement>('.image-unresolved, .note-warning, .image-repair, .heading-anchor').forEach(element => {
      element.replaceChildren();
      mounted.push(mount(Icon, { target: element, props: { name: element.classList.contains('heading-anchor') ? 'link' : 'warning', size: '1em' } }));
    });
    onElement?.(article);
    return () => { for (const component of mounted) void unmount(component); };
  });
  function follow(event: MouseEvent) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    const repair = target?.closest<HTMLButtonElement>('button[data-image-index]');
    if (repair && onImagePick) {
      event.preventDefault(); repair.disabled = true;
      void onImagePick(Number(repair.dataset.imageIndex)).finally(() => { repair.disabled = false; });
      return;
    }
    const anchor = target?.closest<HTMLAnchorElement>('a');
    if (!anchor) return;
    if (anchor.dataset.pagePath && onNavigate) {
      event.preventDefault(); onNavigate(anchor.dataset.pagePath, anchor.hash);
    } else if (anchor.getAttribute('href')?.startsWith('#')) {
      event.preventDefault();
      const id = decodeURIComponent(anchor.hash.slice(1));
      if (onHeading) onHeading(id);
      else article.querySelector<HTMLElement>('#' + CSS.escape(id))?.scrollIntoView({ block: 'start' });
    }
  }
  function delegateLinks(element: HTMLElement) {
    element.addEventListener('click', follow);
    return { destroy: () => element.removeEventListener('click', follow) };
  }
</script>

<article class="prose" bind:this={article} use:delegateLinks>{@html html}</article>
