import type { CreatePageInput, DeletePageInput, DiffResponse, HistoryEntry, MovePageInput, MutationResult, PageRecord, PublishPageInput, RepairImageInput, SavePageInput, VersionResponse } from '../../../../packages/contracts';
import { WikiClient } from '../lib/api';

export class AdminClient extends WikiClient {
  private token = '';
  private initialization?: Promise<void>;
  initialize(): Promise<void> {
    return this.initialization ??= this.request<{ token: string }>('/admin/session').then(session => { this.token = session.token; }).catch(error => { this.initialization = undefined; throw error; });
  }
  private async mutate(endpoint: string, method: string, body: unknown): Promise<MutationResult> {
    await this.initialize();
    return this.request(endpoint, { method, headers: { 'content-type': 'application/json', 'x-wiki-token': this.token }, body: JSON.stringify(body) });
  }
  original(id: string): Promise<PageRecord> { return this.request('/admin/pages/' + id); }
  pages(): Promise<Omit<PageRecord, 'content'>[]> { return this.request('/admin/pages'); }
  create(input: CreatePageInput): Promise<MutationResult> { return this.mutate('/admin/pages', 'POST', input); }
  save(id: string, input: SavePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id, 'PUT', input); }
  publish(id: string, input: PublishPageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/publish', 'POST', input); }
  repairImage(id: string, input: RepairImageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/images', 'POST', input); }
  move(id: string, input: MovePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id + '/move', 'POST', input); }
  delete(id: string, input: DeletePageInput): Promise<MutationResult> { return this.mutate('/admin/pages/' + id, 'DELETE', input); }
  history(id: string): Promise<HistoryEntry[]> { return this.request('/admin/pages/' + id + '/history'); }
  version(id: string, commit: string): Promise<VersionResponse> { return this.request(`/admin/pages/${id}/versions/${commit}`); }
  diff(id: string, from: string, to: string): Promise<DiffResponse> { return this.request(`/admin/pages/${id}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`); }
}
