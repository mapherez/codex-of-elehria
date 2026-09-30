import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import type { Nodes } from 'mdast';
import { validatePath } from '../infrastructure/filesystem';

export const imageExtension = /\.(png|jpe?g|gif|webp|avif|svg)$/i;
export interface WikiImage { start: number; end: number; reference: string; suffix: string; width?: number; height?: number }

// Source ranges let a repair change one embed without reformatting the note.
export function wikiImages(content: string): WikiImage[] {
  const result: WikiImage[] = [];
  const tree = fromMarkdown(content, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  function visit(node: Nodes): void {
    if (node.type === 'text' && node.position) {
      const start = node.position.start.offset!;
      const raw = content.slice(start, node.position.end.offset!);
      for (const match of raw.matchAll(/!\[\[([^\]\r\n]+)\]\]/g)) {
        const before = raw.slice(0, match.index);
        if ((before.match(/\\+$/)?.[0].length || 0) % 2) continue;
        const [reference = '', ...options] = match[1]!.split('|');
        if (!imageExtension.test(reference.trim())) continue;
        const dimensions = /^(\d+)(?:x(\d+))?$/.exec(options.join('|').trim());
        result.push({ start: start + match.index, end: start + match.index + match[0].length,
          reference: reference.trim(), suffix: options.length ? '|' + options.join('|') : '',
          ...(dimensions ? { width: Number(dimensions[1]), ...(dimensions[2] ? { height: Number(dimensions[2]) } : {}) } : {}) });
      }
    } else if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  return result.sort((a, b) => a.start - b.start);
}

export function replaceWikiImages(content: string, images: WikiImage[], replacement: (image: WikiImage, index: number) => string): string {
  for (let index = images.length - 1; index >= 0; index--) {
    const image = images[index]!;
    content = content.slice(0, image.start) + replacement(image, index) + content.slice(image.end);
  }
  return content;
}

export class ImageIndex {
  private readonly paths: Set<string>;
  private readonly names = new Map<string, string[]>();
  constructor(paths: string[] = []) {
    this.paths = new Set(paths);
    for (const file of paths) {
      const name = path.posix.basename(file);
      this.names.set(name, [...(this.names.get(name) || []), file]);
    }
  }
  resolve(reference: string): { path?: string; reason?: 'missing' | 'ambiguous' } {
    try {
      let file = decodeURIComponent(reference).normalize('NFC');
      const explicit = file.includes('/');
      if (file.startsWith('./')) file = file.slice(2);
      if (file.startsWith('_images/')) file = file.slice(8);
      validatePath(file, false);
      if (explicit) return this.paths.has(file) ? { path: file } : { reason: 'missing' };
      const matches = this.names.get(file) || [];
      return matches.length === 1 ? { path: matches[0]! } : { reason: matches.length ? 'ambiguous' : 'missing' };
    } catch { return { reason: 'missing' }; }
  }
}
