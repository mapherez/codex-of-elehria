import path from 'node:path';
import { randomUUID } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import type { Nodes } from 'mdast';
import type { Heading, ImageBindings, RenderedMarkdown } from '../../../../packages/contracts';
import { pageUrl } from '../../../../packages/contracts/routes';
import type { Translator } from '../../../../packages/i18n';
import { validatePath } from '../infrastructure/filesystem';
import { ImageIndex, replaceWikiImages, wikiImages } from './wiki-images';
import { installWikiLinks, NoteIndex, type WikiLink } from './wiki-links';

const linkNormalizer = new MarkdownIt();
export const normalizeImageUrl = (url: string) => linkNormalizer.normalizeLink(url);
export function relocateImageBindings(bindings: ImageBindings | undefined, oldPath: string, newPath: string): ImageBindings | undefined {
  if (!bindings) return undefined;
  return Object.fromEntries(Object.entries(bindings).map(([key, value]) => {
    if (!key.startsWith('m:') || key.slice(2).startsWith('/')) return [key, value];
    const target = resolveLocalLink(key.slice(2), oldPath);
    if (!target) return [key, value];
    const relative = path.posix.relative(path.posix.dirname(newPath), target.path === oldPath ? newPath : target.path);
    const url = relative.split('/').map(segment => segment === '..' ? segment : encodeURIComponent(segment)).join('/') + target.suffix;
    return ['m:' + normalizeImageUrl(url), value];
  }));
}

function assignHeadings(tokens: Token[]): Heading[] {
  const headings: Heading[] = [];
  const used = new Set<string>();
  tokens.forEach((token, index) => {
    if (token.type !== 'heading_open') return;
    const text = (tokens[index + 1]?.children || []).filter(child => ['text', 'code_inline', 'image', 'wiki_link'].includes(child.type)).map(child => child.content).join('');
    const base = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || `h-${index}`;
    let id = base;
    for (let suffix = 1; used.has(id); suffix++) id = `${base}-${suffix}`;
    used.add(id); token.attrSet('id', id);
    headings.push({ id, text, level: Number(token.tag.slice(1)) });
  });
  return headings;
}

export function resolveLocalLink(url: string, source: string): { path: string; suffix: string } | null {
  if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) return null;
  const parts = /^([^?#]*)(.*)$/.exec(url);
  if (!parts) return null;
  try {
    const raw = decodeURIComponent(parts[1]!);
    if (raw.includes('\\')) return null;
    const target = path.posix.normalize(raw.startsWith('/') ? raw.slice(1) : path.posix.join(path.posix.dirname(source), raw));
    validatePath(target, false);
    return { path: target, suffix: parts[2]! };
  } catch { return null; }
}

export class MarkdownRenderer {
  private readonly parser = new MarkdownIt({ html: false, linkify: false });
  constructor(private readonly t: Translator, private readonly basePath: string) { installWikiLinks(this.parser); }

  outline(content: string): Heading[] { return assignHeadings(this.prepare(content).tokens); }

  noteIndex(pages: { path: string; aliases: string[]; content: string; deleted: boolean }[]): NoteIndex {
    return new NoteIndex(pages.filter(page => !page.deleted).map(page => ({ ...page, headings: this.outline(page.content) })));
  }

  private prepare(content: string) {
    const embeds = wikiImages(content);
    const marker = 'codex-image:' + randomUUID() + ':';
    const prepared = replaceWikiImages(content, embeds, (embed, index) =>
      `![${embed.reference.replace(/[\\\[\]]/g, '\\$&')}](${marker}${index})`);
    return { embeds, marker, tokens: this.parser.parse(prepared, {}) };
  }

  render(content: string, source: string, images = new ImageIndex(), notes?: NoteIndex, bindings?: ImageBindings): RenderedMarkdown {
    const { embeds, marker, tokens } = this.prepare(content);
    const outline = assignHeadings(tokens);
    const headings = outline.filter(heading => heading.level >= 2);
    const firstTitle = outline.find(heading => heading.level === 1);
    const title = firstTitle?.text ?? path.posix.basename(source).replace(/\.md$/i, '');
    const hasTitle = Boolean(firstTitle);
    const noteIndex = notes || new NoteIndex([{ path: source, aliases: [], headings: outline }]);
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!;
      let inertLink = false;
      for (const child of token.children || []) {
        if (child.type === 'link_close' && inertLink) { child.tag = 'span'; inertLink = false; }
        if (child.type === 'image' && child.attrGet('src')?.startsWith(marker)) {
          const index = Number(child.attrGet('src')!.slice(marker.length));
          const embed = embeds[index]!;
          const binding = bindings?.['w:' + embed.reference];
          const resolved = binding ? { ...binding, path: binding.path?.replace(/^_images\//, '') }
            : bindings && !/^(\.\/|_images\/)/.test(embed.reference) ? { reason: 'missing' as const } : images.resolve(embed.reference);
          if (resolved.path) {
            const relative = '_images/' + resolved.path;
            child.attrSet('src', this.basePath + '/media/' + relative.split('/').map(encodeURIComponent).join('/'));
            child.attrSet('data-media-path', relative);
            child.attrSet('loading', 'lazy');
            if (embed.width && embed.width <= 10000) child.attrSet('width', String(embed.width));
            if (embed.height && embed.height <= 10000) child.attrSet('height', String(embed.height));
          } else {
            child.type = 'wiki_image_missing';
            child.meta = { index, reference: embed.reference, reason: resolved.reason };
          }
          continue;
        }
        const attribute = child.type === 'link_open' ? 'href' : child.type === 'image' ? 'src' : null;
        if (!attribute) continue;
        const original = child.attrGet(attribute) || '';
        const bound = child.type === 'image' ? bindings?.['m:' + original] : undefined;
        if (bound) {
          if (bound.path) {
            child.attrSet('src', this.basePath + '/media/' + bound.path.split('/').map(encodeURIComponent).join('/'));
            child.attrSet('data-media-path', bound.path); child.attrSet('loading', 'lazy');
          } else { child.type = 'import_image_missing'; child.meta = { reference: original, reason: bound.reason }; }
          continue;
        }
        const target = resolveLocalLink(original, source);
        if (target) {
          if (/\.md$/i.test(target.path) && child.type === 'link_open') {
            if (notes && !notes.hasPath(target.path)) {
              child.tag = 'span'; child.attrs = null; inertLink = true;
              continue;
            }
            child.attrSet('href', pageUrl(target.path, this.basePath) + target.suffix);
            child.attrSet('data-page-path', target.path);
            child.attrSet('data-page-suffix', target.suffix);
          } else {
            child.attrSet(attribute, this.basePath + '/media/' + target.path.split('/').map(encodeURIComponent).join('/') + target.suffix);
            child.attrSet('data-media-path', target.path);
          }
        } else if (original && !original.startsWith('#') && !/^(https?:|mailto:)/i.test(original)) child.attrSet(attribute, '#');
        if (child.type === 'image') child.attrSet('loading', 'lazy');
      }
    }
    const escape = this.parser.utils.escapeHtml;
    this.parser.renderer.rules.wiki_link = (items, index) => {
      const link = items[index]!.meta as WikiLink;
      const resolved = noteIndex.resolve(link, source);
      if ('reason' in resolved) {
        const name = link.target + (link.heading === undefined ? '' : '#' + link.heading);
        const label = this.t(`link.${resolved.reason}`, { name });
        return `${escape(link.label)}<span class="note-warning" data-note-warning role="img" aria-label="${escape(label)}" title="${escape(label)}">&#9888;</span>`;
      }
      return `<a href="${escape(pageUrl(resolved.path, this.basePath) + resolved.suffix)}" data-page-path="${escape(resolved.path)}" data-page-suffix="${escape(resolved.suffix)}">${escape(link.label)}</a>`;
    };
    this.parser.renderer.rules.wiki_image_missing = (items, index) => {
      const { index: occurrence, reference, reason } = items[index]!.meta as { index: number; reference: string; reason: 'missing' | 'ambiguous' };
      const label = this.t(reason === 'ambiguous' ? 'image.ambiguous' : 'image.missing', { name: reference });
      return `<span class="image-unresolved" data-image-index="${occurrence}" data-image-name="${escape(reference)}" role="img" aria-label="${escape(label)}" title="${escape(label)}">&#9888;</span>`;
    };
    this.parser.renderer.rules.import_image_missing = (items, index) => {
      const { reference, reason } = items[index]!.meta;
      const label = this.t(reason === 'ambiguous' ? 'image.ambiguous' : 'image.missing', { name: reference });
      return `<span class="image-unresolved" role="img" aria-label="${escape(label)}" title="${escape(label)}">&#9888;</span>`;
    };
    this.parser.renderer.rules.heading_close = (items, index) => {
      const opening = items[index - 2];
      const id = opening?.attrGet('id');
      const text = items[index - 1]?.content || '';
      return `${id ? `<a class="heading-anchor" href="#${escape(id)}" aria-label="${escape(this.t('toc.permalink', { heading: text }))}">#</a>` : ''}</${items[index]!.tag}>\n`;
    };
    let html = this.parser.renderer.render(tokens, this.parser.options, {});
    if (!hasTitle) html = `<h1>${escape(title)}</h1>\n` + html;
    return { title, html: html.replace(/<pre>/g, '<pre tabindex="0">'), headings };
  }
}

export function relocateLinks(content: string, oldPath: string, newPath: string): string {
  const embeds = wikiImages(content);
  const marker = 'CODEXIMAGE' + randomUUID().replaceAll('-', '');
  const links: string[] = [];
  const protectedContent = replaceWikiImages(content, embeds, (_embed, index) => marker + index + 'END')
    .replace(/\\*!?\[\[[^\]\r\n]+\]\]/g, link => { links.push(link); return marker + 'LINK' + (links.length - 1) + 'END'; });
  const tree = fromMarkdown(protectedContent, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
  let changed = false;
  function visit(node: Nodes): void {
    if (('url' in node) && !node.url.startsWith('/')) {
      const target = resolveLocalLink(node.url, oldPath);
      if (target) {
        const destination = target.path === oldPath ? newPath : target.path;
        const relative = path.posix.relative(path.posix.dirname(newPath), destination);
        const next = relative.split('/').map(segment => segment === '..' ? segment : encodeURIComponent(segment)).join('/') + target.suffix;
        if (next !== node.url) { node.url = next; changed = true; }
      }
    }
    if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  if (!changed) return content;
  let result = toMarkdown(tree, { extensions: [gfmToMarkdown()] });
  embeds.forEach((embed, index) => { result = result.replaceAll(marker + index + 'END', content.slice(embed.start, embed.end)); });
  links.forEach((link, index) => { result = result.replaceAll(marker + 'LINK' + index + 'END', link); });
  return result;
}
