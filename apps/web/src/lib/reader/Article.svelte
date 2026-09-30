<script lang="ts">
  import type { PageResponse } from '../../../../../packages/contracts';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  import type { Translator } from '../../../../../packages/i18n';
  let { page, basePath, apiBase, onNavigate, onHeading, onElement, onImagePick, t }: {
    page: PageResponse; basePath: string; apiBase: string;
    t: Translator; onImagePick?: (page: PageResponse, occurrence: number) => Promise<void>;
    onNavigate: (path: string, hash?: string) => void; onHeading: (id: string) => void;
    onElement: (element: HTMLElement) => void;
  } = $props();
  let article: HTMLElement;
  $effect(() => {
    page.html;
    if (!article) return;
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
      const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true'); icon.textContent = '\u26a0';
      button.append(icon); placeholder.replaceWith(button);
    });
    onElement(article);
  });
  function follow(event: MouseEvent) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const repair = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-image-index]');
    if (repair && onImagePick) {
      event.preventDefault(); repair.disabled = true;
      void onImagePick(page, Number(repair.dataset.imageIndex)).finally(() => { repair.disabled = false; });
      return;
    }
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a');
    if (!anchor) return;
    if (anchor.dataset.pagePath) {
      event.preventDefault(); onNavigate(anchor.dataset.pagePath, anchor.hash);
    } else if (anchor.getAttribute('href')?.startsWith('#')) {
      event.preventDefault(); onHeading(decodeURIComponent(anchor.hash.slice(1)));
    }
  }
  function delegateLinks(element: HTMLElement) {
    element.addEventListener('click', follow);
    return { destroy: () => element.removeEventListener('click', follow) };
  }
</script>

<article class="prose" bind:this={article} use:delegateLinks>
  {@html page.html}
</article>
