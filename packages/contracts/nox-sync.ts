import { z } from 'zod';
import type { ApiError, ImageBindings, ImportOrigin } from './index';

export const noxSettingsSchema = z.object({ url: z.string().max(2048), apiKey: z.string().max(4096).optional() });
export const noxPrepareSchema = z.object({ listingId: z.string().uuid(), paths: z.array(z.string()).min(1).max(10000) });
export const noxApplySchema = z.object({ decisions: z.record(z.string(), z.enum(['keep', 'replace'])), confirmReplace: z.boolean().default(false) });
export interface NoxSettings { url: string; hasKey: boolean; connectionId?: string }
export interface NoxVault { vaultId: string; name: string; revision: number }
export interface NoxFile { path: string; hash: string; size: number; revision: number }
export interface ImportNoteState { status: ImportStatus; targetPath: string; reason?: ApiError['error'] }
export interface NoxListing { listingId: string; vaultId: string; serverRevision: number; files: NoxFile[]; notes: Record<string, ImportNoteState> }
export type ImportStatus = 'new' | 'update' | 'unchanged' | 'conflict' | 'blocked';
export interface ImportReview {
  path: string; targetPath: string; status: ImportStatus; reason?: ApiError['error']; warnings: { reference: string; reason: 'missing' | 'ambiguous' }[];
  localContent?: string; remoteContent?: string;
}
export interface ImportBatchPage {
  path: string; id?: string; expectedRevision?: string; content: string; origin: Omit<ImportOrigin, 'importedRevision'>; imageBindings: ImageBindings;
}
export interface NoxJob {
  id: string; state: 'preparing' | 'ready' | 'applying' | 'done' | 'cancelled' | 'failed';
  completed: number; total: number; reviews: ImportReview[]; error?: ApiError['error'];
  result?: { id: string; path: string; unchanged: boolean }[];
}
