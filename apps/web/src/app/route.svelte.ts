import { fileFromLocation, pageUrl } from '../../../../packages/contracts/routes';

export class StandaloneRoute {
  path = $state('home.md');
  hash = $state('');
  constructor(readonly basePath: string) { this.read(); }
  private read(): void { this.path = fileFromLocation(location.pathname, this.basePath); this.hash = location.hash; }
  navigate(path: string, hash = '', replace = false): void {
    const url = pageUrl(path, this.basePath) + hash;
    if (location.pathname + location.hash !== url) history[replace ? 'replaceState' : 'pushState'](null, '', url);
    this.path = path; this.hash = hash;
  }
  connect(canLeave: () => boolean = () => true): () => void {
    const pop = () => {
      if (!canLeave()) { history.pushState(null, '', pageUrl(this.path, this.basePath) + this.hash); return; }
      this.read();
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }
}
