import { z } from 'zod';
import type { Dictionary, ErrorCode, Values } from '../i18n/index';

export interface PageRecord {
  id: string;
  path: string;
  aliases: string[];
  revision: string;
  deleted: boolean;
  updatedAt: string;
  content: string;
  origin?: ImportOrigin;
  imageBindings?: ImageBindings;
}
export interface ImportOrigin {
  connectionId: string; vaultId: string; path: string; hash: string; remoteRevision: number; importedRevision: string;
}
export type ImageBindings = Record<string, { path?: string; reason?: 'missing' | 'ambiguous' }>;
export interface Heading { id: string; text: string; level: number }
export interface RenderedMarkdown { title: string; html: string; headings: Heading[] }
export interface PublishedPage extends RenderedMarkdown {
  id: string; path: string; aliases: string[]; revision: string;
}
export type NavigationNode =
  | { type: 'folder'; path: string; name: string; children: NavigationNode[] }
  | { type: 'page'; path: string; name: string };
export interface Publication {
  schema: 1; revision: string; publishedAt: string;
  navigation: NavigationNode[]; pages: PublishedPage[];
  importedMedia?: string[];
}
export interface SearchSegment { text: string; match: boolean }
export interface SearchResult { id: string; path: string; revision: string; name: string; snippet: SearchSegment[]; fragment: string }
export interface SearchResponse { query: string; revision: string; total: number; offset: number; limit: number; results: SearchResult[] }
export const searchQuerySchema = z.object({
  q: z.string().max(300).default(''),
  offset: z.coerce.number().int().min(0).max(10000000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});
export interface NavigationResponse { revision: string; navigation: NavigationNode[]; count: number }
export type PublicationStatus = 'draft' | 'published' | 'changes';
export interface PageResponse extends PublishedPage { publication: string; redirected: boolean; publicationStatus?: PublicationStatus }
export interface ApiError { error: { code: ErrorCode; params?: Values; current?: PageRecord; committed?: boolean } }
export interface HistoryEntry { commit: string; date: string; author: string; message: string }
export interface VersionResponse extends PageRecord, RenderedMarkdown {}
export interface DiffResponse {
  before: { path: string; deleted: boolean }; after: { path: string; deleted: boolean };
  changes: { added?: boolean; removed?: boolean; value: string; count?: number }[];
}
export interface PublicConfig {
  locale: string; messages: Dictionary; brand: { name: string; logoUrl: string | null }; basePath: string;
}
export interface MutationResult { page: PageRecord; unchanged?: boolean }
export interface PendingPublication { id: string; path: string; revision: string; status: 'draft' | 'changes' }
export interface PublishBatchResult { count: number }

const summary = z.string().max(500).optional();
export const createPageSchema = z.object({ path: z.string(), content: z.string(), message: summary });
export const savePageSchema = z.object({ content: z.string(), revision: z.string(), message: summary });
export const movePageSchema = z.object({ path: z.string(), revision: z.string(), message: summary });
export const deletePageSchema = z.object({ revision: z.string(), message: summary });
export const publishPageSchema = z.object({ revision: z.string() });
export const publishBatchSchema = z.object({ pages: z.array(z.object({ id: z.string().min(1), revision: z.string().min(1) })).min(1).max(10000) });
export type PublishBatchInput = z.infer<typeof publishBatchSchema>;
export const previewPageSchema = z.object({ content: z.string(), path: z.string().optional(), id: z.string().optional() });
export type PreviewPageInput = z.infer<typeof previewPageSchema>;
export type PublishPageInput = z.infer<typeof publishPageSchema>;
export const repairImageSchema = z.object({
  revision: z.string(), occurrence: z.number().int().nonnegative(),
  path: z.string().optional(), name: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/)
});
export type RepairImageInput = z.infer<typeof repairImageSchema>;
export type CreatePageInput = z.infer<typeof createPageSchema>;
export type SavePageInput = z.infer<typeof savePageSchema>;
export type MovePageInput = z.infer<typeof movePageSchema>;
export type DeletePageInput = z.infer<typeof deletePageSchema>;
