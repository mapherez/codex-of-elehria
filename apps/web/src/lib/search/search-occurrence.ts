interface Boundary { node: Node; offset: number }
interface Piece { length: number; start: Boundary; end: Boundary; text?: Text }

export function scrollToSearchOccurrence(article: HTMLElement, fragment: string): boolean {
  const match = /^search-(s\d+)~(\d+)~(\d+)$/.exec(fragment);
  if (!match) return false;
  const block = article.querySelector<HTMLElement>('[data-search-block="' + match[1] + '"]');
  if (!block) return true;
  const pieces: Piece[] = [];
  function visit(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node as Text;
      pieces.push({ length: text.length, text, start: { node, offset: 0 }, end: { node, offset: text.length } });
    } else if (node instanceof Element) {
      if (node !== block && (node.hasAttribute('data-search-block') || node.matches('img, .heading-anchor, .note-warning, .image-unresolved, .image-repair'))) return;
      if (node.tagName === 'BR' && node.parentNode) {
        const offset = [...node.parentNode.childNodes].indexOf(node as ChildNode);
        pieces.push({ length: 1, start: { node: node.parentNode, offset }, end: { node: node.parentNode, offset: offset + 1 } });
      } else node.childNodes.forEach(visit);
    }
  }
  visit(block);
  function boundary(offset: number, end: boolean): Boundary | undefined {
    let consumed = 0;
    for (const piece of pieces) {
      if (offset <= consumed + piece.length) {
        if (piece.text) return { node: piece.text, offset: Math.max(0, offset - consumed) };
        return end ? piece.end : piece.start;
      }
      consumed += piece.length;
    }
    return pieces.at(-1)?.end;
  }
  const from = boundary(Number(match[2]), false); const to = boundary(Number(match[3]), true);
  block.scrollIntoView({ block: 'center' });
  if (from && to) {
    const range = document.createRange();
    range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
    const bounds = range.getBoundingClientRect();
    const overflow = block.closest('pre');
    if (overflow && bounds.height) {
      const container = overflow.getBoundingClientRect();
      overflow.scrollTop += bounds.top - container.top - 30;
      overflow.scrollLeft += Math.max(0, bounds.left - container.left - 30);
    }
    const top = document.querySelector('header')?.getBoundingClientRect().bottom || 0;
    if (bounds.height) window.scrollBy({ top: range.getBoundingClientRect().top - top - 60, behavior: 'instant' });
  }
  return true;
}
