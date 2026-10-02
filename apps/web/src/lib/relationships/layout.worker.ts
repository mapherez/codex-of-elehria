import { ForceLayout } from './force-layout';
import type { LayoutFrame, LayoutMessage } from './graph-types';

const layout = new ForceLayout();
let timer: ReturnType<typeof setTimeout> | undefined;
let lastFrame = 0;
function publish(frame: LayoutFrame) { globalThis.postMessage(frame); }
function step() {
  timer = undefined;
  const frame = layout.frame(); const now = performance.now();
  if (frame.done || now - lastFrame >= 30) { publish(frame); lastFrame = now; }
  if (!frame.done) timer = setTimeout(step, 16);
}
globalThis.onmessage = (event: MessageEvent<LayoutMessage>) => {
  const input = event.data;
  if (input.type === 'layout') { clearTimeout(timer); timer = undefined; lastFrame = 0; layout.reset(input); }
  else if (!layout.drag(input)) return;
  if (!layout.animate) { publish(layout.frame(true)); return; }
  if (timer === undefined) step();
};
