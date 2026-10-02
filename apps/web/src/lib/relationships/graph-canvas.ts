import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import type { RelationshipsResponse } from '../../../../../packages/contracts';
import type { GraphLine, GraphPoint, LayoutDrag, LayoutFrame, LayoutRequest } from './graph-types';

interface Callbacks {
  navigate: (path: string) => void;
  hover: (point: GraphPoint | null) => void;
  settled: (settled: boolean) => void;
  failed: () => void;
}
export class GraphCanvas {
  private context: CanvasRenderingContext2D;
  private worker: Worker;
  private observer: ResizeObserver;
  private motion = matchMedia('(prefers-reduced-motion: reduce)');
  private zoom: ZoomBehavior<HTMLCanvasElement, unknown>;
  private transform: ZoomTransform = zoomIdentity;
  private points = new Map<string, GraphPoint>();
  private lines: GraphLine[] = [];
  private center = '';
  private run = 0;
  private width = 1; private height = 1; private pixelRatio = 1;
  private autoFit = true;
  private layoutPending = false;
  private drawFrame = 0;
  private hovered: GraphPoint | null = null;
  private disposed = false;
  private dragging: { pointerId: number; id: string; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
  private suppressClick = false;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly callbacks: Callbacks) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    this.context = context;
    this.worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<LayoutFrame>) => {
      if (this.disposed || event.data.run !== this.run) return;
      for (const value of event.data.positions) {
        const point = this.points.get(value.id);
        if (point && !(this.dragging?.moved && point.id === this.dragging.id)) { point.x = value.x; point.y = value.y; }
      }
      this.layoutPending = !event.data.done;
      if (this.autoFit) this.fit(false);
      this.callbacks.settled(event.data.done); this.draw();
    };
    this.worker.onerror = () => { this.worker.terminate(); this.callbacks.failed(); };
    this.zoom = zoom<HTMLCanvasElement, unknown>()
      .extent(() => [[0, 0], [this.width, this.height]])
      .scaleExtent([.02, 32]).clickDistance(5)
      .filter(event => {
        if (this.dragging || (event.ctrlKey && event.type !== 'wheel') || event.button) return false;
        if (event.type === 'touchstart') return event.touches.length > 1 || !this.hit(event.touches[0]);
        return event.type !== 'mousedown' || !this.hit(event);
      })
      .on('zoom', event => {
        this.transform = event.transform;
        if (event.sourceEvent) this.autoFit = false;
        this.setHover(null); this.draw();
      });
    select(canvas).call(this.zoom);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerUp);
    canvas.addEventListener('lostpointercapture', this.pointerUp);
    canvas.addEventListener('pointermove', this.pointer);
    canvas.addEventListener('pointerleave', this.leave);
    canvas.addEventListener('click', this.click);
    this.motion.addEventListener('change', this.motionChanged);
    window.addEventListener('blur', this.cancelDrag);
    this.observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const previousWidth = this.width; const previousHeight = this.height;
      this.width = rect.width; this.height = rect.height; this.pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(this.width * this.pixelRatio); canvas.height = Math.round(this.height * this.pixelRatio);
      if (this.autoFit) this.fit(false);
      else this.apply(zoomIdentity.translate(this.transform.x + (this.width - previousWidth) / 2, this.transform.y + (this.height - previousHeight) / 2).scale(this.transform.k));
      this.draw();
    });
    this.observer.observe(canvas);
  }

  update(response: RelationshipsResponse): void {
    this.finishDrag();
    const changed = this.center !== response.centerId;
    if (changed) { this.points.clear(); this.autoFit = true; }
    this.center = response.centerId;
    const previous = this.points; this.points = new Map();
    const seed = (id: string, name: string, incoming: number, path?: string, warning?: string) => {
      const old = previous.get(id); const index = this.points.size;
      const radius = id === this.center ? 7 : Math.min(6, 3 + Math.sqrt(incoming));
      const distance = 28 * Math.sqrt(index);
      this.points.set(id, { id, name, path, incoming, radius, warning, x: id === this.center ? 0 : old?.x ?? Math.cos(index * 2.399963) * distance, y: id === this.center ? 0 : old?.y ?? Math.sin(index * 2.399963) * distance });
    };
    const center = response.nodes.find(node => node.id === this.center)!;
    seed(center.id, center.name, center.incoming, center.path);
    for (const node of response.nodes) if (node.id !== this.center) seed(node.id, node.name, node.incoming, node.path);
    this.lines = response.edges.map(edge => ({ source: edge.sourceId, target: edge.targetId }));
    for (const problem of response.unresolved || []) {
      const id = problem.targetId || 'unresolved:' + problem.reference;
      if (!this.points.has(id)) seed(id, problem.reference, 0, undefined, problem.reason);
      if (!this.lines.some(line => line.source === this.center && line.target === id && line.pending))
        this.lines.push({ source: this.center, target: id, pending: true });
    }
    this.setHover(null); this.layout(); this.draw();
  }
  private layout(): void {
    if (!this.center || this.disposed) return;
    this.layoutPending = true;
    this.callbacks.settled(false);
    const request: LayoutRequest = { type: 'layout', run: ++this.run, centerId: this.center, points: [...this.points.values()], lines: this.lines, animate: !this.motion.matches };
    this.worker.postMessage(request);
  }
  private motionChanged = () => { this.finishDrag(); this.layout(); };
  private apply(transform: ZoomTransform) { select(this.canvas).call(this.zoom.transform, transform); }
  scale(factor: number): void { this.autoFit = false; select(this.canvas).call(this.zoom.scaleBy, factor); }
  fit(manual = true): void {
    if (!this.points.size || this.width <= 1) return;
    if (manual) this.autoFit = true;
    let spanX = 45; let spanY = 45;
    for (const point of this.points.values()) { spanX = Math.max(spanX, Math.abs(point.x) + point.radius + 12); spanY = Math.max(spanY, Math.abs(point.y) + point.radius + 12); }
    const scale = Math.max(.02, Math.min(1.7, (this.width - 32) / (spanX * 2), (this.height - 32) / (spanY * 2)));
    this.apply(zoomIdentity.translate(this.width / 2, this.height / 2).scale(scale));
  }
  private draw(): void {
    cancelAnimationFrame(this.drawFrame);
    this.drawFrame = requestAnimationFrame(() => this.paint());
  }
  private paint(): void {
    if (this.motion.matches && this.layoutPending) return;
    const { context: ctx, transform: camera } = this;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0); ctx.clearRect(0, 0, this.width, this.height);
    ctx.translate(camera.x, camera.y); ctx.scale(camera.k, camera.k);
    const radius = (point: GraphPoint) => Math.max((point.id === this.center ? 4 : 2) / camera.k, point.radius);
    const pairs = new Set(this.lines.filter(line => !line.pending).map(line => line.source + ':' + line.target));
    for (const line of this.lines) {
      const from = this.points.get(line.source); const to = this.points.get(line.target);
      if (!from || !to) continue;
      const dx = to.x - from.x; const dy = to.y - from.y; const length = Math.hypot(dx, dy);
      if (length <= radius(from) + radius(to) + 5 / camera.k) continue;
      const ux = dx / length; const uy = dy / length;
      const offset = pairs.has(line.target + ':' + line.source) ? 2 / camera.k : 0;
      const ax = from.x + ux * radius(from) - uy * offset; const ay = from.y + uy * radius(from) + ux * offset;
      const bx = to.x - ux * (radius(to) + 2 / camera.k) - uy * offset; const by = to.y - uy * (radius(to) + 2 / camera.k) + ux * offset;
      const highlighted = this.hovered && [line.source, line.target].includes(this.hovered.id);
      ctx.strokeStyle = line.pending ? '#c5a273' : highlighted ? '#bec9d4' : '#66717e';
      ctx.lineWidth = (highlighted ? 1.4 : .8) / camera.k;
      ctx.setLineDash(line.pending ? [3 / camera.k, 3 / camera.k] : []);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.setLineDash([]);
      const size = 4 / camera.k;
      ctx.beginPath(); ctx.moveTo(bx - ux * size - uy * size * .6, by - uy * size + ux * size * .6);
      ctx.lineTo(bx, by); ctx.lineTo(bx - ux * size + uy * size * .6, by - uy * size - ux * size * .6); ctx.stroke();
    }
    for (const point of this.points.values()) {
      ctx.beginPath(); ctx.arc(point.x, point.y, radius(point), 0, Math.PI * 2);
      ctx.fillStyle = point.id === this.center ? '#cfb991' : this.hovered?.id === point.id ? '#e7e6e2' : '#9aaec5';
      if (!point.warning) ctx.fill();
      ctx.strokeStyle = point.warning ? '#c5a273' : '#101214'; ctx.lineWidth = 1.2 / camera.k; ctx.stroke();
      if (this.hovered?.id === point.id) { ctx.beginPath(); ctx.arc(point.x, point.y, radius(point) + 3 / camera.k, 0, Math.PI * 2); ctx.strokeStyle = '#cfb991'; ctx.stroke(); }
    }
  }
  private hit(event: { clientX: number; clientY: number }): GraphPoint | null {
    const bounds = this.canvas.getBoundingClientRect(); const [x, y] = this.transform.invert([event.clientX - bounds.left, event.clientY - bounds.top]);
    let best: GraphPoint | null = null; let distance = Infinity;
    for (const point of this.points.values()) {
      const delta = Math.hypot(point.x - x, point.y - y);
      if (delta < distance && delta <= Math.max(point.radius, (point.id === this.center ? 4 : 2) / this.transform.k) + 6 / this.transform.k) { best = point; distance = delta; }
    }
    return best;
  }
  private setHover(point: GraphPoint | null): void {
    if (this.hovered?.id === point?.id) return;
    this.hovered = point; this.canvas.style.cursor = point?.path && point.id !== this.center ? 'pointer' : 'grab';
    this.callbacks.hover(point); this.draw();
  }
  private pointerDown = (event: PointerEvent) => {
    if (!event.isPrimary) { this.finishDrag(); return; } // A second touch can start pinch zoom.
    this.suppressClick = false;
    if (event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const point = this.hit(event);
    if (!point) return;
    const bounds = this.canvas.getBoundingClientRect();
    const [x, y] = this.transform.invert([event.clientX - bounds.left, event.clientY - bounds.top]);
    this.dragging = { pointerId: event.pointerId, id: point.id, startX: event.clientX, startY: event.clientY, offsetX: point.x - x, offsetY: point.y - y, moved: false };
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  private pointer = (event: PointerEvent) => {
    const gesture = this.dragging;
    if (!gesture || gesture.pointerId !== event.pointerId) { if (!event.buttons) this.setHover(this.hit(event)); return; }
    if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) <= 5) return;
    const point = this.points.get(gesture.id);
    if (!point) { this.finishDrag(); return; }
    gesture.moved = true; this.suppressClick = true; this.autoFit = false;
    const bounds = this.canvas.getBoundingClientRect();
    const [x, y] = this.transform.invert([event.clientX - bounds.left, event.clientY - bounds.top]);
    point.x = x + gesture.offsetX; point.y = y + gesture.offsetY;
    this.setHover(point); this.canvas.style.cursor = 'grabbing';
    const input: LayoutDrag = { type: 'drag', run: this.run, id: point.id, position: { x: point.x, y: point.y } };
    this.worker.postMessage(input); this.callbacks.settled(false); this.draw();
    event.preventDefault();
  };
  private cancelDrag = () => this.finishDrag();
  private pointerUp = (event: PointerEvent) => { if (event.pointerId === this.dragging?.pointerId) this.finishDrag(); };
  private finishDrag(): void {
    const gesture = this.dragging;
    if (!gesture) return;
    this.dragging = null;
    if (gesture.moved && !this.disposed) {
      const input: LayoutDrag = { type: 'drag', run: this.run, id: gesture.id };
      this.worker.postMessage(input);
    }
    if (this.canvas.hasPointerCapture(gesture.pointerId)) this.canvas.releasePointerCapture(gesture.pointerId);
    this.canvas.style.cursor = this.hovered?.path && this.hovered.id !== this.center ? 'pointer' : 'grab';
  }
  private leave = () => { if (!this.dragging) this.setHover(null); };
  private click = (event: MouseEvent) => {
    if (this.suppressClick || this.disposed || event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const point = this.hit(event);
    if (point?.path && point.id !== this.center) this.callbacks.navigate(point.path);
  };
  highlight(id?: string): void { this.setHover(id ? this.points.get(id) || null : null); }
  destroy(): void {
    this.disposed = true; this.finishDrag(); this.worker.terminate(); this.observer.disconnect(); this.motion.removeEventListener('change', this.motionChanged);
    cancelAnimationFrame(this.drawFrame); select(this.canvas).on('.zoom', null);
    window.removeEventListener('blur', this.cancelDrag);
    this.canvas.removeEventListener('pointerdown', this.pointerDown); this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerUp); this.canvas.removeEventListener('lostpointercapture', this.pointerUp);
    this.canvas.removeEventListener('pointermove', this.pointer); this.canvas.removeEventListener('pointerleave', this.leave); this.canvas.removeEventListener('click', this.click);
  }
}
