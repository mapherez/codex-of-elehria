import type { SearchResponse, ApiError, NavigationResponse, PageResponse, PublicConfig } from '../../../../packages/contracts';
import type { ErrorCode } from '../../../../packages/i18n';

export class ApiClientError extends Error {
  constructor(readonly detail: ApiError['error'], readonly status: number) { super(detail.code); }
}

export function errorDetail(error: unknown): ApiError['error'] {
  return error instanceof ApiClientError ? error.detail : { code: 'error.network' };
}

export class WikiClient {
  constructor(readonly apiBase: string) {}
  async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try { response = await fetch(this.apiBase + endpoint, { ...init, cache: 'no-store' }); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiClientError({ code: 'error.network' }, 0);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: { code: 'error.internal' as ErrorCode } })) as ApiError;
      throw new ApiClientError(payload.error, response.status);
    }
    return response.json() as Promise<T>;
  }
  search(query: string, offset = 0, limit = 10, signal?: AbortSignal): Promise<SearchResponse> {
    return this.request('/search?' + new URLSearchParams({ q: query, offset: String(offset), limit: String(limit) }), { signal });
  }
  config(): Promise<PublicConfig> { return this.request('/config'); }
  navigation(signal?: AbortSignal): Promise<NavigationResponse> { return this.request('/navigation', { signal }); }
  page(path: string, signal?: AbortSignal): Promise<PageResponse> { return this.request('/page?path=' + encodeURIComponent(path), { signal }); }
}
