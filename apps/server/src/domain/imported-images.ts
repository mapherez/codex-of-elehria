import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import type { Nodes } from 'mdast';
import type { ImageBindings } from '../../../../packages/contracts';
import type { NoxFile } from '../../../../packages/contracts/nox-sync';
import { wikiImages, imageExtension } from './wiki-images';
import { normalizeImageUrl, resolveLocalLink } from './markdown';

export const importedImageRoot = '_images/nox-sync/';
export const isImportedImage = (file: string) => file.toLowerCase().startsWith(importedImageRoot);
export const importedImagePath = (connection: string, vault: string, file: NoxFile) =>
  importedImageRoot + connection + '/' + vault + '/' + file.hash + '/' + file.path;

export function markdownImages(content: string): string[] {
  const tree = fromMarkdown(content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  const definitions = new Map<string, string>();
  const references: string[] = [];
  const identifiers: string[] = [];
  function visit(node: Nodes) {
    if (node.type === 'definition') definitions.set(node.identifier, node.url);
    if (node.type === 'image') references.push(node.url);
    if (node.type === 'imageReference') identifiers.push(node.identifier);
    if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  for (const id of identifiers) if (definitions.has(id)) references.push(definitions.get(id)!);
  return [...new Set(references)];
}

// Bind source references to immutable asset versions without rewriting Markdown.
export function bindImportedImages(content: string, source: string, files: NoxFile[], assetPath: (file: NoxFile) => string) {
  const images = files.filter(file => imageExtension.test(file.path));
  const needed = new Map<string, NoxFile>();
  const bindings: ImageBindings = {};
  const warnings: { reference: string; reason: 'missing' | 'ambiguous' }[] = [];
  function bind(key: string, reference: string, candidates: NoxFile[]) {
    for (const file of candidates) needed.set(file.path, file);
    if (candidates.length === 1) bindings[key] = { path: assetPath(candidates[0]!) };
    else {
      const reason = candidates.length ? 'ambiguous' : 'missing';
      bindings[key] = { reason }; warnings.push({ reference, reason });
    }
  }
  for (const embed of wikiImages(content)) {
    let reference: string;
    try { reference = decodeURIComponent(embed.reference).normalize('NFC').replace(/^\.\//, ''); }
    catch { bind('w:' + embed.reference, embed.reference, []); continue; }
    const candidates = reference.includes('/')
      ? images.filter(file => file.path === reference)
      : images.filter(file => path.posix.basename(file.path) === reference);
    bind('w:' + embed.reference, embed.reference, candidates);
  }
  for (const url of markdownImages(content)) {
    if (/^(https?:|data:|\/\/)/i.test(url)) continue;
    const target = resolveLocalLink(url, source);
    bind('m:' + normalizeImageUrl(url), url, target ? images.filter(file => file.path === target.path) : []);
  }
  return { bindings, needed: [...needed.values()], warnings };
}
