import type { ApiError, NavigationNode, PageResponse } from '../../../../../packages/contracts';
import { WikiClient, errorDetail } from '../api';

export class ReaderModel {
  page = $state.raw<PageResponse | null>(null);
  navigation = $state.raw<NavigationNode[]>([]);
  error = $state.raw<ApiError['error'] | null>(null);
  loading = $state(true);
  offline = $state(false);
  count = $state(0);
  private path = 'home.md';
  private revision = '';
  private controller?: AbortController;
  private events?: EventSource;
  private requestId = 0;

  constructor(private readonly apiBase: () => string, private readonly onPublication: () => void) {}

  async open(path: string, silent = false): Promise<void> {
    this.path = path;
    this.controller?.abort();
    const signal = (this.controller = new AbortController()).signal;
    const requestId = ++this.requestId;
    if (!silent) { this.loading = true; this.error = null; }
    const client = new WikiClient(this.apiBase());
    const [navigation, page] = await Promise.allSettled([client.navigation(signal), client.page(path, signal)]);
    if (requestId !== this.requestId || signal.aborted) return;
    if (navigation.status === 'fulfilled') {
      this.navigation = navigation.value.navigation;
      this.count = navigation.value.count;
      this.revision = navigation.value.revision;
    }
    if (page.status === 'fulfilled') { this.page = page.value; this.error = null; }
    else { this.error = errorDetail(page.reason); if (!silent || this.error.code === 'error.notFound') this.page = null; }
    this.loading = false;
  }
  connect(): () => void {
    this.events = new EventSource(this.apiBase() + '/events');
    this.events.onopen = () => { this.offline = false; void this.open(this.path, true); };
    this.events.onerror = () => { this.offline = true; };
    this.events.addEventListener('publication', event => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { revision: string };
      if (payload.revision === this.revision) return;
      this.onPublication();
      void this.open(this.path, true);
    });
    return () => { this.events?.close(); this.controller?.abort(); this.requestId++; };
  }
}
