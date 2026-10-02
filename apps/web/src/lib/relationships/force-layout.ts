import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import type { LayoutDrag, LayoutFrame, LayoutRequest } from './graph-types';

interface Point extends SimulationNodeDatum { id: string; radius: number }

// Kept inside the worker: gestures reheat the current simulation and retain
// velocities rather than rebuilding the graph for every pointer movement.
export class ForceLayout {
  private simulation?: Simulation<Point, undefined>;
  private points = new Map<string, Point>();
  private dragging = new Set<string>();
  private request?: LayoutRequest;
  private returningCenter = false;

  get animate(): boolean { return Boolean(this.request?.animate); }

  reset(request: LayoutRequest): void {
    this.simulation?.stop();
    this.request = request; this.dragging.clear(); this.returningCenter = false;
    const points: Point[] = request.points.map(point => ({
      id: point.id, radius: point.radius, x: point.x, y: point.y,
      ...(point.id === request.centerId ? { fx: 0, fy: 0 } : {})
    }));
    this.points = new Map(points.map(point => [point.id, point]));
    const unique = new Map<string, { source: string; target: string }>();
    for (const line of request.lines) unique.set(JSON.stringify([line.source, line.target].sort()), { source: line.source, target: line.target });
    this.simulation = forceSimulation(points)
      .force('links', forceLink<Point, { source: string; target: string }>([...unique.values()]).id(point => point.id).distance(75 + Math.sqrt(points.length) * 5).strength(.2))
      .force('repel', forceManyBody().strength(-85))
      .force('collide', forceCollide<Point>().radius(point => point.radius + 9))
      .force('x', forceX(0).strength(.02))
      .force('y', forceY(0).strength(.02))
      .alphaDecay(.035).alphaMin(.005).stop();
  }

  drag(input: LayoutDrag): boolean {
    const point = this.points.get(input.id);
    if (!point || !this.simulation || input.run !== this.request?.run) return false;
    if (input.position) {
      const { x, y } = input.position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      point.x = point.fx = x; point.y = point.fy = y; point.vx = point.vy = 0;
      this.dragging.add(point.id);
      if (point.id === this.request.centerId) this.returningCenter = false;
    } else {
      if (!this.dragging.delete(point.id)) return false;
      if (point.id === this.request.centerId) this.returningCenter = true;
      else { point.fx = null; point.fy = null; }
    }
    this.simulation.alpha(Math.max(this.simulation.alpha(), .35)).alphaTarget(this.dragging.size ? .18 : 0);
    return true;
  }

  frame(final = false): LayoutFrame {
    if (!this.request || !this.simulation) throw new Error('Layout not initialized');
    if (this.returningCenter) {
      const center = this.points.get(this.request.centerId)!;
      center.fx = final ? 0 : (center.fx || 0) * .7;
      center.fy = final ? 0 : (center.fy || 0) * .7;
      if (Math.hypot(center.fx, center.fy) < .1) { center.fx = center.fy = 0; this.returningCenter = false; }
    }
    this.simulation.tick(final ? 200 : 3);
    return {
      run: this.request.run,
      positions: [...this.points.values()].map(point => ({ id: point.id, x: point.x!, y: point.y! })),
      done: final || (!this.dragging.size && !this.returningCenter && this.simulation.alpha() < this.simulation.alphaMin())
    };
  }
}
