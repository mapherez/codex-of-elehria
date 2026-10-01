import type { CreatePageInput, DeletePageInput, DiffResponse, HistoryEntry, MovePageInput, MutationResult, PageRecord, PublishPageInput, RepairImageInput, SavePageInput, VersionResponse } from '../../../../packages/contracts';
import { ApiClientError, WikiClient } from '../lib/api';
import type { NoxJob, NoxListing, NoxSettings, NoxVault } from '../../../../packages/contracts/nox-sync';
import type { PreviewPageInput, RenderedMarkdown } from '../../../../packages/contracts';
import type { PendingPublication, PublishBatchInput, PublishBatchResult } from '../../../../packages/contracts';

export class AdminClient extends WikiClient {
  private token = '';
  private initialization?: Promise<void>;
  initialize(): Promise<void> {
    return this.initialization ??= this.request<{ token: string }>('/admin/session').then(session => { this.token = session.token; }).catch(error => { this.initialization = undefined; throw error; });
  }
  private async mutate<T = MutationResult>(endpoint: string, method: string, body: unknown): Promise<T> {
    await this.initialize();
    return this.request(endpoint, { method, headers: { 'content-type': 'application/json', 'x-wiki-token': this.token }, body: JSON.stringify(body) });
  }
  original(id: string): Promise<PageRecord> { return this.request('/admin/pages/' + id); }
  async preview(input: PreviewPageInput): Promise<RenderedMarkdown> {
    try { return await this.mutate('/admin/preview', 'POST', input); }
    catch (error) {
      if (error instanceof ApiClientError && error.status === 404) throw new ApiClientError({ code: 'error.previewUnavailable' }, 404);
      throw error;
    }
  }
  pages(): Promise<Omit<PageRecord, 'content'>[]> { return this.request('/admin/pages'); }
  pendingPublications(): Promise<PendingPublication[]> { return this.request('/admin/publication/pending'); }
  publishBatch(input: PublishBatchInput): Promise<PublishBatchResult> { return this.mutate('/admin/publication/publish', 'POST', input); }
  create(input: CreatePageInput): Promise<MutationResult> { return this.mutate('/admin/pages', 'POST', input); }
  save(id: string, input: SavePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id, 'PUT', input); }
  publish(id: string, input: PublishPageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/publish', 'POST', input); }
  repairImage(id: string, input: RepairImageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/images', 'POST', input); }
  move(id: string, input: MovePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/move', 'POST', input); }
  delete(id: string, input: DeletePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id, 'DELETE', input); }
  history(id: string): Promise<HistoryEntry[]> { return this.request('/admin/pages/' + id + '/history'); }
  version(id: string, commit: string): Promise<VersionResponse> { return this.request(`/admin/pages/${id}/versions/${commit}`); }
  diff(id: string, from: string, to: string): Promise<DiffResponse> { return this.request(`/admin/pages/${id}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
  noxSettings(): Promise<NoxSettings> { return this.request('/admin/nox/connection'); }
  noxConnect(input: { url: string; apiKey: string }): Promise<{ settings: NoxSettings; vaults: NoxVault[] }> { return this.mutate('/admin/nox/connection', 'PUT', input); }
  noxDisconnect(): Promise<NoxSettings> { return this.mutate('/admin/nox/connection', 'DELETE', {}); }
  noxVaults(): Promise<NoxVault[]> { return this.request('/admin/nox/vaults'); }
  noxFiles(vaultId: string): Promise<NoxListing> { return this.request('/admin/nox/files?vaultId=' + encodeURIComponent(vaultId)); }
  noxPrepare(listingId: string, paths: string[]): Promise<NoxJob> { return this.mutate('/admin/nox/imports', 'POST', { listingId, paths }); }
  noxJob(id: string): Promise<NoxJob> { return this.request('/admin/nox/imports/' + id); }
  noxCancel(id: string): Promise<NoxJob> { return this.mutate('/admin/nox/imports/' + id, 'DELETE', {}); }
  noxApply(id: string, decisions: Record<string, 'keep' | 'replace'>, confirmReplace: boolean): Promise<NoxJob> { return this.mutate('/admin/nox/imports/' + id + '/apply', 'POST', { decisions, confirmReplace }); }
}
