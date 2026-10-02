import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { LayoutFrame, LayoutRequest } from './graph-types';

interface Point extends SimulationNodeDatum { id: string; radius: number }
let timer: ReturnType<typeof setTimeout> | undefined;
globalThis.onmessage = (event: MessageEvent<LayoutRequest>) => {
  clearTimeout(timer);
  const request = event.data;
  const points: Point[] = request.points.map(point => ({
    id: point.id, radius: point.radius, x: point.x, y: point.y,
    ...(point.id === request.centerId ? { fx: 0, fy: 0 } : {})
  }));
  const unique = new Map<string, { source: string; target: string }>();
  for (const line of request.lines) {
    const key = JSON.stringify([line.source, line.target].sort());
    unique.set(key, { source: line.source, target: line.target });
  }
  const simulation = forceSimulation(points)
    .force('links', forceLink<Point, { source: string; target: string }>([...unique.values()]).id(point => point.id).distance(75 + Math.sqrt(points.length) * 5).strength(.2))
    .force('repel', forceManyBody().strength(-85))
    .force('collide', forceCollide<Point>().radius(point => point.radius + 9))
    .force('x', forceX(0).strength(.02))
    .force('y', forceY(0).strength(.02))
    .alphaDecay(.035).alphaMin(.005).stop();
  let ticks = 0; let lastFrame = 0;
  function frame(done: boolean) {
    const value: LayoutFrame = { run: request.run, positions: points.map(point => ({ id: point.id, x: point.x!, y: point.y! })), done };
    globalThis.postMessage(value);
  }
  if (!request.animate) { simulation.tick(200); frame(true); return; }
  function step() {
    simulation.tick(3); ticks += 3;
    const done = simulation.alpha() < simulation.alphaMin() || ticks >= 200;
    const now = performance.now();
    if (done || now - lastFrame >= 45) { frame(done); lastFrame = now; }
    if (!done) timer = setTimeout(step, 16);
  }
  step();
};
