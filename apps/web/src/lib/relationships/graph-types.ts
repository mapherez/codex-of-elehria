export interface GraphPoint {
  id: string; name: string; path?: string; incoming: number; radius: number;
  warning?: string; x: number; y: number;
}
export interface GraphLine { source: string; target: string; pending?: boolean }
export interface LayoutRequest { run: number; centerId: string; points: GraphPoint[]; lines: GraphLine[]; animate: boolean }
export interface LayoutFrame { run: number; positions: { id: string; x: number; y: number }[]; done: boolean }
