import path from 'node:path';
import type MarkdownIt from 'markdown-it';
import type { Heading } from '../../../../packages/contracts';
import { validatePath } from '../infrastructure/filesystem';

export interface WikiLink { target: string; heading?: string; label: string }
export interface NoteTarget { path: string; aliases: string[]; headings: Heading[] }
export type LinkResolution = { path: string; suffix: string } | { reason: 'missing' | 'ambiguous' | 'headingMissing' };

// An inline rule leaves fenced code, escaped brackets and inline code untouched.
export function installWikiLinks(parser: MarkdownIt): void {
  parser.inline.ruler.before('link', 'wiki_link', (state, silent) => {
    const start = state.pos;
    // markdown-it exposes linkLevel at runtime; its published types omit it.
    if (silent || (state as typeof state & { linkLevel: number }).linkLevel || !state.src.startsWith('[[', start) || state.src[start - 1] === '!') return false;
    const end = state.src.indexOf(']]', start + 2);
    if (end < 0 || end + 2 > state.posMax) return false;
    const raw = state.src.slice(start + 2, end);
    if (!raw || /[\r\n\[\]]/.test(raw)) return false;
    const separator = raw.indexOf('|');
    const reference = (separator < 0 ? raw : raw.slice(0, separator)).trim();
    const hash = reference.indexOf('#');
    const target = (hash < 0 ? reference : reference.slice(0, hash)).trim();
    const heading = hash < 0 ? undefined : reference.slice(hash + 1).trim();
    if ((!target && !heading) || heading?.startsWith('^')) return false;
    if (!silent) {
      const token = state.push('wiki_link', '', 0);
      const label = separator < 0 ? reference : raw.slice(separator + 1);
      token.content = label;
      token.meta = { target, heading, label } satisfies WikiLink;
    }
    state.pos = end + 2;
    return true;
  });
}

export class NoteIndex {
  private readonly paths = new Map<string, NoteTarget>();
  private readonly aliases = new Map<string, NoteTarget>();
  private readonly names = new Map<string, Set<NoteTarget>>();
  constructor(notes: NoteTarget[] = []) {
    for (const note of notes) {
      this.paths.set(note.path, note);
      for (const file of [note.path, ...note.aliases]) {
        if (file !== note.path) this.aliases.set(file, note);
        const name = path.posix.basename(file);
        const matches = this.names.get(name) || new Set<NoteTarget>();
        matches.add(note); this.names.set(name, matches);
      }
    }
  }

  hasPath(file: string): boolean { return this.paths.has(file) || this.aliases.has(file); }

  resolve(link: WikiLink, source: string): LinkResolution {
    let note: NoteTarget | undefined;
    if (!link.target) note = this.paths.get(source) || this.aliases.get(source);
    else {
      try {
        let file = decodeURIComponent(link.target).normalize('NFC');
        const explicit = file.includes('/');
        if (file.startsWith('./')) file = file.slice(2);
        if (file.startsWith('/')) file = file.slice(1);
        if (!/\.md$/i.test(file)) file += '.md';
        validatePath(file);
        if (explicit) note = this.paths.get(file) || this.aliases.get(file);
        else {
          const matches = [...(this.names.get(file) || [])];
          if (matches.length > 1) return { reason: 'ambiguous' };
          note = matches[0];
        }
      } catch { return { reason: 'missing' }; }
    }
    if (!note) return { reason: 'missing' };
    if (link.heading === undefined) return { path: note.path, suffix: '' };
    let heading: string;
    try { heading = decodeURIComponent(link.heading).normalize('NFC'); } catch { return { reason: 'headingMissing' }; }
    const target = note.headings.find(item => item.text.normalize('NFC') === heading)
      || note.headings.find(item => item.id === heading)
      || note.headings.find(item => item.text.normalize('NFC').toLowerCase() === heading.toLowerCase());
    return target ? { path: note.path, suffix: '#' + encodeURIComponent(target.id) } : { reason: 'headingMissing' };
  }
}
