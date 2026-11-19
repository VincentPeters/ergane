// Sheet layout: row packing (spec 8, v1). Pieces sort by height and fill rows left to right;
// a full sheet starts the next one. No rotation and no dense nesting yet.
// ponytail: shelf packing wastes the gap above short pieces in a tall row; nest when sheets cost money.
import { bbox, type Path } from './geometry'

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

export type Packed = { sheets: Path[][]; placed: { piece: number; sheet: number }[]; tooBig: number[] }

/** Packs pieces onto sheets. `reserve` keeps a corner block free on every sheet (for the reference square). */
export function pack(pieces: Path[][], sheet: Sheet, reserve?: { w: number; h: number }): Packed {
  const s = sheet.spacing
  const boxes = pieces.map((p) => bbox(p))
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b].h - boxes[a].h || boxes[b].w - boxes[a].w)
  const sheets: Path[][] = []
  const placed: Packed['placed'] = []
  const tooBig: number[] = []
  let x = 0, y = 0, rowH = 0
  const newSheet = () => {
    sheets.push(reserve ? [referenceSquare(s, s)] : [])
    x = s + (reserve ? reserve.w + s : 0); y = s; rowH = reserve ? reserve.h : 0
  }
  for (const i of order) {
    const b = boxes[i]
    if (b.w + 2 * s > sheet.w || b.h + 2 * s > sheet.h) { tooBig.push(i); continue }
    if (!sheets.length) newSheet()
    if (x + b.w + s > sheet.w) { x = s; y += rowH + s; rowH = 0 }
    if (y + b.h + s > sheet.h) newSheet()
    sheets[sheets.length - 1].push(...pieces[i].map((p) => translate(p, x - b.x, y - b.y)))
    placed.push({ piece: i, sheet: sheets.length - 1 })
    x += b.w + s
    rowH = Math.max(rowH, b.h)
  }
  return { sheets, placed, tooBig }
}
