import path from 'node:path';
import { randomUUID } from 'node:crypto';
import MarkdownIt from 'markdown-it';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown, gfmToMarkdown } from 'mdast-util-gfm';
import type { Nodes } from 'mdast';
import type { Heading, RenderedMarkdown } from '../../../../packages/contracts';
import { pageUrl } from '../../../../packages/contracts/routes';
import type { Translator } from '../../../../packages/i18n';
import { validatePath } from '../infrastructure/filesystem';
import { ImageIndex, replaceWikiImages, wikiImages } from './wiki-images';

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
  constructor(private readonly t: Translator, private readonly basePath: string) {}

  render(content: string, source: string, images = new ImageIndex()): RenderedMarkdown {
    const embeds = wikiImages(content);
    const marker = 'codex-image:' + randomUUID() + ':';
    const prepared = replaceWikiImages(content, embeds, (embed, index) =>
      `![${embed.reference.replace(/[\\\[\]]/g, '\\$&')}](${marker}${index})`);
    const tokens = this.parser.parse(prepared, {});
    const headings: Heading[] = [];
    const used = new Set<string>();
    let title = path.posix.basename(source).replace(/\.md$/i, '');
    let hasTitle = false;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index]!;
      if (token.type === 'heading_open') {
        const text = (tokens[index + 1]?.children || []).filter(child => ['text', 'code_inline', 'image'].includes(child.type)).map(child => child.content).join('');
        const base = text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || `h-${index}`;
        let id = base;
        for (let suffix = 1; used.has(id); suffix++) id = `${base}-${suffix}`;
        used.add(id);
        token.attrSet('id', id);
        const level = Number(token.tag.slice(1));
        if (level === 1 && !hasTitle) { title = text; hasTitle = true; }
        if (level >= 2) headings.push({ id, text, level });
      }
      for (const child of token.children || []) {
        if (child.type === 'image' && child.attrGet('src')?.startsWith(marker)) {
          const index = Number(child.attrGet('src')!.slice(marker.length));
          const embed = embeds[index]!;
          const resolved = images.resolve(embed.reference);
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
        const target = resolveLocalLink(original, source);
        if (target) {
          if (/\.md$/i.test(target.path) && child.type === 'link_open') {
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
    this.parser.renderer.rules.wiki_image_missing = (items, index) => {
      const { index: occurrence, reference, reason } = items[index]!.meta as { index: number; reference: string; reason: 'missing' | 'ambiguous' };
      const label = this.t(reason === 'ambiguous' ? 'image.ambiguous' : 'image.missing', { name: reference });
      return `<span class="image-unresolved" data-image-index="${occurrence}" data-image-name="${escape(reference)}" role="img" aria-label="${escape(label)}" title="${escape(label)}">&#9888;</span>`;
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
  const protectedContent = replaceWikiImages(content, embeds, (_embed, index) => marker + index + 'END');
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
  return result;
}
