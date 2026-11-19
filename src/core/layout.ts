// Sheet helpers shared by the nester (nest.ts) and the exporters.
import type { Path } from './geometry'

export type Sheet = { w: number; h: number; spacing: number }
export const SHEET_PRESETS: [number, number][] = [[300, 200], [600, 300], [600, 400], [900, 600]]

export const translate = (p: Path, dx: number, dy: number): Path => {
  const s = p.shape
  return {
    op: p.op,
    shape: s.kind === 'circle' ? { ...s, cx: s.cx + dx, cy: s.cy + dy } : { ...s, pts: s.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) },
  }
}

/** A 10 mm square to check import scale, engraved so it never cuts through. */
export const referenceSquare = (x: number, y: number): Path =>
  ({ op: 'engrave', shape: { kind: 'poly', pts: [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]] } })

