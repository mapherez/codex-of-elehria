import { fileFromLocation, pageUrl } from '../../../../packages/contracts/routes';

export class StandaloneRoute {
  path = $state('home.md');
  hash = $state('');
  search = $state<string | null>(null);
  constructor(readonly basePath: string) { this.read(); }
  private read(): void {
    const searching = location.pathname === this.basePath + '/search';
    this.search = searching ? new URLSearchParams(location.search).get('q') || '' : null;
    this.path = searching ? 'home.md' : fileFromLocation(location.pathname, this.basePath);
    this.hash = location.hash;
  }
  private currentUrl(): string {
    return this.search === null ? pageUrl(this.path, this.basePath) + this.hash : this.basePath + '/search?' + new URLSearchParams({ q: this.search });
  }
  navigate(path: string, hash = '', replace = false): void {
    const url = pageUrl(path, this.basePath) + hash;
    if (location.pathname + location.search + location.hash !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    this.path = path; this.hash = hash; this.search = null;
  }
  navigateSearch(query: string): void {
    const url = this.basePath + '/search?' + new URLSearchParams({ q: query });
    if (location.pathname + location.search !== url) history.pushState(null, '', url);
    this.search = query; this.path = 'home.md'; this.hash = '';
  }
  connect(canLeave: () => boolean = () => true): () => void {
    const pop = () => {
      if (!canLeave()) { history.pushState(null, '', this.currentUrl()); return; }
      this.read();
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }
}
