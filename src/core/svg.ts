import { bbox, type Op, type Path } from './geometry'

// Cut order: engrave, inner cuts, outer cuts. Parts stay in place while holes are cut.
export const OPS: [Op, string][] = [
  ['engrave', 'engrave'],
  ['inner', 'cut-inner'],
  ['outer', 'cut-outer'],
]
export type Colors = Record<Op, string>
export const DEFAULT_COLORS: Colors = { engrave: '#0000FF', inner: '#00FF00', outer: '#FF0000' }
export const SINGLE_COLOR = '#000000'

/** What goes into one exported file. */
export type ExportOpts = {
  colors?: Colors
  ops?: Op[] // only these operations (one file per operation)
  single?: boolean // every path in one colour; the operator sets the order by hand
  sheet?: { w: number; h: number } // file covers the whole sheet from (0, 0) instead of the parts' bounds
}

const f = (n: number) => +n.toFixed(4)

/** SVG path data for a poly or line shape, rounded to 0.1 µm so output is identical on every JS engine. */
export function pathData(s: Exclude<Path['shape'], { kind: 'circle' }>) {
  return `M${s.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}${s.kind === 'poly' ? 'Z' : ''}`
}

/** The paths an export keeps, grouped in cut order, with the colour each group is drawn in. */
export function exportGroups(paths: Path[], opts: ExportOpts = {}) {
  const colors = opts.colors ?? DEFAULT_COLORS
  return OPS.filter(([op]) => !opts.ops || opts.ops.includes(op))
    .map(([op, name]) => ({ op, name, color: opts.single ? SINGLE_COLOR : colors[op], items: paths.filter((p) => p.op === op) }))
    .filter((g) => g.items.length)
}

function shape(p: Path) {
  const s = p.shape
  if (s.kind === 'circle') return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}"/>`
  return `<path d="${pathData(s)}"/>`
}

export function toSVG(paths: Path[], opts: ExportOpts = {}): string {
  const b = opts.sheet ? { x: 0, y: 0, w: opts.sheet.w, h: opts.sheet.h } : bbox(paths)
  const groups = exportGroups(paths, opts).map((g) =>
    `<g id="${g.name}" inkscape:groupmode="layer" inkscape:label="${g.name}" fill="none" stroke="${g.color}" stroke-width="0.01">${g.items.map(shape).join('')}</g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(b.w)}mm" height="${f(b.h)}mm" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}">${groups}</svg>`
}
