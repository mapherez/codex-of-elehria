import { Parser } from 'htmlparser2';
import type { Publication, PublishedPage, SearchResponse, SearchResult, SearchSegment } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';

interface Range { start: number; end: number }
interface Folded { text: string; starts: number[]; ends: number[] }
interface Reference extends Range { value: string; normalized: string }
interface Block { anchor: string; kind: string; text: string; references: Reference[]; folded: Folded }
interface Prepared { html: string; blocks: Block[] }

function fold(value: string): Folded {
  let text = ''; const starts: number[] = []; const ends: number[] = [];
  let offset = 0;
  for (const character of value) {
    const next = offset + character.length;
    const normalized = character.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    if (!normalized && ends.length) ends[ends.length - 1] = next;
    for (const char of normalized) {
      const unit = /\s/u.test(char) ? ' ' : char;
      if (unit === ' ' && text.endsWith(' ')) { ends[ends.length - 1] = next; continue; }
      text += unit;
      for (let i = 0; i < unit.length; i++) { starts.push(offset); ends.push(next); }
    }
    offset = next;
  }
  return { text, starts, ends };
}

// The same rendered snapshot supplies the index and occurrence anchors. No draft
// files or private Git state are read by the public search, including old snapshots.
export function prepareSearchHtml(html: string, t: Translator): Prepared {
  const blocks: Block[] = []; const additions: { offset: number; value: string }[] = [];
  const stack: { skip: boolean; block?: Block; reference?: { block: Block; value: string; start: number } }[] = [];
  const current = () => [...stack].reverse().find(frame => frame.block)?.block;
  function legacyReference(label: string): string | undefined {
    for (const code of ['link.missing', 'link.ambiguous', 'link.headingMissing'] as const) {
      const [prefix, suffix] = t(code, { name: '__SEARCH_NAME__' }).split('__SEARCH_NAME__');
      if (prefix !== undefined && suffix !== undefined && label.startsWith(prefix) && label.endsWith(suffix))
        return label.slice(prefix.length, suffix ? -suffix.length : undefined);
    }
  }
  const parser = new Parser({
    onopentag(name, attrs) {
      const parent = current();
      const classes = (attrs.class || '').split(/\s+/);
      const skip = Boolean(stack.at(-1)?.skip || attrs['data-search-ignore'] !== undefined
        || ['img', 'script', 'style'].includes(name) || (name === 'h1' && !attrs.id)
        || classes.some(value => ['heading-anchor', 'note-warning', 'image-unresolved', 'image-repair'].includes(value)));
      if (parent && classes.includes('note-warning') && !stack.at(-1)?.skip) {
        const value = attrs['data-search-target'] ?? legacyReference(attrs['aria-label'] || attrs.title || '');
        if (value) {
          const end = parent.text.length;
          const start = attrs['data-search-label'] ? end - attrs['data-search-label'].length : parent.text.search(/\S+\s*$/);
          parent.references.push({ value, normalized: fold(value).text, start: Math.max(0, start), end });
        }
      }
      let block: Block | undefined;
      if (!skip && /^(p|h[1-6]|li|th|td|pre)$/.test(name)) {
        block = { anchor: 's' + blocks.length, kind: name, text: '', references: [], folded: fold('') };
        blocks.push(block);
        additions.push({ offset: parser.endIndex, value: ' data-search-block="' + block.anchor + '"' });
      }
      const active = block || parent;
      const value = attrs['data-search-target'] ?? (attrs['data-page-path']?.replace(/\.md$/i, ''));
      const reference = !skip && active && value ? { block: active, value, start: active.text.length } : undefined;
      stack.push({ skip, block, reference });
      if (!skip && name === 'br' && active) active.text += '\n';
    },
    ontext(value) { if (!stack.at(-1)?.skip) { const block = current(); if (block) block.text += value; } },
    onclosetag() {
      const frame = stack.pop();
      if (frame?.reference) {
        const { block, value, start } = frame.reference;
        block.references.push({ value, normalized: fold(value).text, start, end: block.text.length });
      }
    }
  }, { decodeEntities: true });
  parser.end(html);
  const parts: string[] = []; let cursor = 0;
  for (const addition of additions) {
    parts.push(html.slice(cursor, addition.offset), addition.value); cursor = addition.offset;
  }
  parts.push(html.slice(cursor)); html = parts.join('');
  for (const block of blocks) block.folded = fold(block.text);
  return { html, blocks: blocks.filter(block => block.folded.text.trim()) };
}

function rangesFor(value: Folded, terms: string[]): Range[] {
  const ranges: Range[] = [];
  for (const term of terms) {
    let at = value.text.indexOf(term);
    while (at >= 0) {
      ranges.push({ start: value.starts[at]!, end: value.ends[at + term.length - 1]! });
      at = value.text.indexOf(term, at + term.length);
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}
function excerpt(text: string, ranges: Range[]): SearchSegment[] {
  const first = ranges[0]!;
  let start = Math.max(0, first.start - 75);
  let end = Math.min(text.length, Math.max(first.end + 75, start + 210));
  if (start) { const space = text.indexOf(' ', start); if (space >= 0 && space < first.start) start = space + 1; }
  if (end < text.length) { const space = text.lastIndexOf(' ', end); if (space > first.end) end = space; }
  const segments: SearchSegment[] = [];
  if (start) segments.push({ text: '… ', match: false });
  let cursor = start;
  for (const range of ranges) {
    const from = Math.max(cursor, range.start, start); const to = Math.min(end, range.end);
    if (to <= from) continue;
    if (from > cursor) segments.push({ text: text.slice(cursor, from), match: false });
    segments.push({ text: text.slice(from, to), match: true }); cursor = to;
  }
  if (cursor < end) segments.push({ text: text.slice(cursor, end), match: false });
  if (end < text.length) segments.push({ text: ' …', match: false });
  return segments;
}

export class SearchIndex {
  private revision = '';
  private prepared = new Map<string, { sourceHtml: string; value: Prepared }>();
  constructor(private readonly t: Translator) {}
  update(publication: Publication) {
    if (publication.revision === this.revision) return;
    this.revision = publication.revision;
    const active = new Set(publication.pages.map(page => page.id));
    for (const id of this.prepared.keys()) if (!active.has(id)) this.prepared.delete(id);
  }
  page(page: PublishedPage): Prepared {
    const cached = this.prepared.get(page.id);
    if (cached?.sourceHtml === page.html) return cached.value;
    const value = prepareSearchHtml(page.html, this.t);
    this.prepared.set(page.id, { sourceHtml: page.html, value }); return value;
  }
  search(publication: Publication, query: string, offset = 0, limit = 10): SearchResponse {
    this.update(publication);
    const phrase = fold(query).text.trim(); const terms = [...new Set(phrase.split(' ').filter(Boolean))];
    const ranked: { result: SearchResult; score: number }[] = [];
    if (terms.length) for (const page of publication.pages) {
      const blocks = this.page(page).blocks;
      const found = new Set<string>();
      let best: { block: Block; ranges: Range[]; score: number } | undefined;
      for (const block of blocks) {
        const matching = terms.filter(term => block.folded.text.includes(term));
        const hidden = block.references.filter(reference => terms.some(term => reference.normalized.includes(term)));
        for (const term of matching) found.add(term);
        for (const reference of hidden) for (const term of terms) if (reference.normalized.includes(term)) found.add(term);
        const ranges = rangesFor(block.folded, terms).concat(hidden.map(({ start, end }) => ({ start, end })))
          .sort((a, b) => a.start - b.start || b.end - a.end);
        if (!ranges.length) continue;
        const distinct = new Set([...matching, ...terms.filter(term => hidden.some(reference => reference.normalized.includes(term)))]);
        const score = (block.folded.text.includes(phrase) ? 1000 : 0) + distinct.size * 50 + (block.kind.startsWith('h') ? 10 : 0);
        if (!best || score > best.score) best = { block, ranges, score };
      }
      if (found.size !== terms.length || !best) continue;
      let snippet = excerpt(best.block.text, best.ranges);
      if (best.block.kind.startsWith('h')) {
        const following = blocks[blocks.indexOf(best.block) + 1];
        if (following && !following.kind.startsWith('h')) {
          const shift = best.block.text.length + 1;
          const contextRanges = rangesFor(following.folded, terms).concat(
            following.references.filter(reference => terms.some(term => reference.normalized.includes(term)))
              .map(({ start, end }) => ({ start, end }))
          ).map(({ start, end }) => ({ start: start + shift, end: end + shift }));
          snippet = excerpt(best.block.text + '\n' + following.text, [...best.ranges, ...contextRanges].sort((a, b) => a.start - b.start || b.end - a.end));
        }
      }
      const occurrence = best.ranges[0]!;
      ranked.push({ score: best.score, result: {
        id: page.id, path: page.path, revision: page.revision, name: page.path.split('/').at(-1)!.replace(/\.md$/i, ''),
        snippet,
        fragment: '#search-' + best.block.anchor + '~' + occurrence.start + '~' + occurrence.end
      } });
    }
    ranked.sort((a, b) => b.score - a.score || a.result.path.localeCompare(b.result.path));
    return { query, revision: publication.revision, total: ranked.length, offset, limit, results: ranked.slice(offset, offset + limit).map(item => item.result) };
  }
}
