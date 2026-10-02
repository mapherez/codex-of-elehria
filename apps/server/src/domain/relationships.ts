import { Parser } from 'htmlparser2';
import type { Heading, Publication, RelationshipEdge, RelationshipNode, RelationshipsResponse, UnresolvedRelationship } from '../../../../packages/contracts';
import type { Translator } from '../../../../packages/i18n';
import { DomainError } from './errors';
import { NoteIndex } from './wiki-links';

interface Reference { kind: 'path' | 'wiki'; target: string; suffix?: string }
interface Extracted { headings: Heading[]; references: Reference[] }
function extract(html: string, t: Translator): Extracted {
  const headings: Heading[] = []; const references: Reference[] = [];
  const frames: { skip: boolean; skipText: boolean; heading?: Heading }[] = [];
  function legacy(label: string): string | undefined {
    for (const code of ['link.missing', 'link.ambiguous', 'link.headingMissing'] as const) {
      const [prefix, suffix] = t(code, { name: '__REFERENCE__' }).split('__REFERENCE__');
      if (prefix !== undefined && suffix !== undefined && label.startsWith(prefix) && label.endsWith(suffix))
        return label.slice(prefix.length, suffix ? -suffix.length : undefined);
    }
  }
  const parser = new Parser({
    onopentag(name, attrs) {
      const classes = (attrs.class || '').split(/\s+/);
      const skip = Boolean(frames.at(-1)?.skip || ['pre', 'code', 'script', 'style'].includes(name) || classes.includes('heading-anchor'));
      const skipText = Boolean(frames.at(-1)?.skipText || ['pre', 'script', 'style'].includes(name)
        || classes.some(value => ['heading-anchor', 'note-warning', 'image-unresolved', 'image-repair'].includes(value)));
      const heading = !skip && /^h[1-6]$/.test(name) && attrs.id
        ? { id: attrs.id, text: '', level: Number(name[1]) } : undefined;
      if (!skip) {
        if (name === 'a' && attrs['data-page-path'])
          references.push({ kind: 'path', target: attrs['data-page-path'], suffix: attrs['data-page-suffix'] || '' });
        else if (attrs['data-note-path'])
          references.push({ kind: 'path', target: attrs['data-note-path'], suffix: attrs['data-note-suffix'] || '' });
        else if (classes.includes('note-warning')) {
          const target = attrs['data-search-target'] ?? legacy(attrs['aria-label'] || attrs.title || '');
          if (target) references.push({ kind: 'wiki', target });
        }
      }
      if (name === 'img' && !skipText) {
        const current = [...frames].reverse().find(frame => frame.heading)?.heading;
        if (current) current.text += attrs.alt || '';
      }
      frames.push({ skip, skipText, heading });
    },
    ontext(text) {
      if (frames.at(-1)?.skipText) return;
      const heading = [...frames].reverse().find(frame => frame.heading)?.heading;
      if (heading) heading.text += text;
    },
    onclosetag() {
      const heading = frames.pop()?.heading;
      if (heading) { heading.text = heading.text.trim(); headings.push(heading); }
    }
  }, { decodeEntities: true });
  parser.end(html);
  return { headings, references };
}

// A projection of the snapshot visible to this server, never of host Markdown.
// IDs and directed edges are independent of any graph layout.
export class RelationshipIndex {
  private revision?: string;
  private extracted = new Map<string, { html: string; value: Extracted }>();
  readonly nodes = new Map<string, RelationshipNode>();
  readonly edges = new Map<string, RelationshipEdge>();
  private paths = new Map<string, string>();
  private aliases = new Map<string, string>();
  private outgoing = new Map<string, RelationshipEdge[]>();
  private incoming = new Map<string, RelationshipEdge[]>();
  private unresolved = new Map<string, UnresolvedRelationship[]>();
  constructor(private readonly t: Translator) {}

  update(publication: Publication): void {
    if (this.revision === publication.revision) return;
    this.nodes.clear(); this.edges.clear(); this.paths.clear(); this.aliases.clear();
    this.outgoing.clear(); this.incoming.clear(); this.unresolved.clear();
    const active = new Set(publication.pages.map(page => page.id));
    for (const id of this.extracted.keys()) if (!active.has(id)) this.extracted.delete(id);
    for (const page of publication.pages) {
      if (this.extracted.get(page.id)?.html !== page.html)
        this.extracted.set(page.id, { html: page.html, value: extract(page.html, this.t) });
      this.nodes.set(page.id, { id: page.id, path: page.path, name: page.path.split('/').at(-1)!.replace(/\.md$/i, ''), incoming: 0 });
      this.paths.set(page.path, page.id);
      for (const alias of page.aliases) this.aliases.set(alias, page.id);
    }
    const notes = new NoteIndex(publication.pages.map(page => ({ path: page.path, aliases: page.aliases, headings: this.extracted.get(page.id)!.value.headings })));
    const find = (path: string) => this.paths.get(path) || this.aliases.get(path);
    for (const page of publication.pages) {
      const problems = new Map<string, UnresolvedRelationship>();
      for (const reference of this.extracted.get(page.id)!.value.references) {
        let targetId: string | undefined; let fragment = ''; let reason: UnresolvedRelationship['reason'] | undefined;
        let display = reference.target;
        if (reference.kind === 'wiki') {
          const hash = reference.target.indexOf('#');
          const target = hash < 0 ? reference.target : reference.target.slice(0, hash);
          if (!target) continue; // Only cross-note references belong in this index.
          const heading = hash < 0 ? undefined : reference.target.slice(hash + 1);
          const note = notes.resolve({ target, label: target }, page.path);
          if ('path' in note) targetId = find(note.path);
          if (targetId === page.id) continue;
          const result = notes.resolve({ target, heading, label: target }, page.path);
          if ('reason' in result) reason = result.reason;
          else { targetId = find(result.path); fragment = result.suffix; }
        } else {
          targetId = find(reference.target);
          if (targetId === page.id) continue;
          const suffix = reference.suffix || '';
          const at = suffix.indexOf('#'); fragment = at < 0 ? '' : suffix.slice(at);
          display += fragment;
          if (!targetId) reason = 'missing';
          else if (fragment.length > 1) {
            try {
              const id = decodeURIComponent(fragment.slice(1));
              if (!this.extracted.get(targetId)!.value.headings.some(heading => heading.id === id)) reason = 'headingMissing';
              else fragment = '#' + encodeURIComponent(id);
            } catch { reason = 'headingMissing'; }
          } else fragment = '';
        }
        if (targetId === page.id) continue;
        if (reason || !targetId) {
          const problem: UnresolvedRelationship = { reference: display, reason: reason || 'missing', ...(targetId ? { targetId } : {}) };
          problems.set(JSON.stringify(problem), problem); continue;
        }
        const key = JSON.stringify([page.id, targetId]);
        let edge = this.edges.get(key);
        if (!edge) {
          edge = { sourceId: page.id, targetId, destinations: [] };
          this.edges.set(key, edge);
          const outgoing = this.outgoing.get(page.id) || []; outgoing.push(edge); this.outgoing.set(page.id, outgoing);
          const incoming = this.incoming.get(targetId) || []; incoming.push(edge); this.incoming.set(targetId, incoming);
        }
        if (!edge.destinations.some(destination => destination.fragment === fragment)) {
          const heading = fragment ? this.extracted.get(targetId)!.value.headings.find(heading => '#' + encodeURIComponent(heading.id) === fragment) : undefined;
          edge.destinations.push({ fragment, ...(heading ? { heading: heading.text } : {}) });
        }
      }
      this.unresolved.set(page.id, [...problems.values()].sort((a, b) => a.reference.localeCompare(b.reference)));
    }
    for (const node of this.nodes.values()) node.incoming = this.incoming.get(node.id)?.length || 0;
    for (const edge of this.edges.values()) edge.destinations.sort((a, b) => a.fragment.localeCompare(b.fragment));
    this.revision = publication.revision;
  }

  local(publication: Publication, path: string, showUnresolved = false): RelationshipsResponse {
    this.update(publication);
    const id = this.paths.get(path) || this.aliases.get(path);
    if (!id) throw new DomainError('error.notFound', 404);
    const edges = [...(this.outgoing.get(id) || []), ...(this.incoming.get(id) || [])];
    const unresolved = showUnresolved ? this.unresolved.get(id) || [] : [];
    const ids = new Set([id]);
    for (const edge of edges) { ids.add(edge.sourceId); ids.add(edge.targetId); }
    for (const problem of unresolved) if (problem.targetId) ids.add(problem.targetId);
    const nodes = [...ids].map(id => this.nodes.get(id)!).sort((a, b) => a.path.localeCompare(b.path));
    return { revision: publication.revision, centerId: id, nodes, edges, ...(showUnresolved ? { unresolved } : {}) };
  }
}
