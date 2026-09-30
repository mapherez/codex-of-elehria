<script lang="ts">
  import type { PageResponse } from '../../../../../packages/contracts';
  import { pageUrl } from '../../../../../packages/contracts/routes';
  let { page, basePath, apiBase, onNavigate, onHeading, onElement }: {
    page: PageResponse; basePath: string; apiBase: string;
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
    onElement(article);
  });
  function follow(event: MouseEvent) {
    if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
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
