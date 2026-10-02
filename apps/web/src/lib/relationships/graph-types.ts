export interface GraphPoint {
  id: string; name: string; path?: string; incoming: number; radius: number;
  warning?: string; x: number; y: number;
}
export interface GraphLine { source: string; target: string; pending?: boolean }
export interface LayoutRequest { type: 'layout'; run: number; centerId: string; points: GraphPoint[]; lines: GraphLine[]; animate: boolean }
export interface LayoutDrag { type: 'drag'; run: number; id: string; position?: { x: number; y: number } }
export type LayoutMessage = LayoutRequest | LayoutDrag;
export interface LayoutFrame { run: number; positions: { id: string; x: number; y: number }[]; done: boolean }
