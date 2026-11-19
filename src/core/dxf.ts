// DXF R12 (AC1009) writer for older laser software. Plain ASCII, mm, one layer per operation.
import { bbox, type Path } from './geometry'
import { exportGroups, type ExportOpts } from './svg'

// R12 has no true colour: map each colour to the nearest of the seven basic AutoCAD colour indices.
const ACI: [number, [number, number, number]][] = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]], [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]], [7, [0, 0, 0]],
]
export function nearestAci(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16)
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return ACI.reduce((best, [i, c]) => {
    const d = c.reduce((s, v, k) => s + (v - rgb[k]) ** 2, 0)
    return d < best[1] ? [i, d] : best
  }, [7, Infinity] as [number, number])[0]
}

const num = (n: number) => String(+n.toFixed(4))

export function toDXF(paths: Path[], opts: ExportOpts = {}): string {
  // DXF's y axis points up; flip inside the sheet (or the parts' bounds) so the drawing keeps its orientation.
  const b = opts.sheet ? { y: 0, h: opts.sheet.h } : bbox(paths)
  const fy = (y: number) => b.y + b.h - y
  const groups = exportGroups(paths, opts)
  const out: (string | number)[] = [0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC']
  out.push(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, groups.length)
  for (const g of groups) out.push(0, 'LAYER', 2, g.name, 70, 0, 62, nearestAci(g.color), 6, 'CONTINUOUS')
  out.push(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES')
  for (const g of groups)
    for (const p of g.items) {
      const s = p.shape
      if (s.kind === 'circle') { out.push(0, 'CIRCLE', 8, g.name, 10, num(s.cx), 20, num(fy(s.cy)), 30, 0, 40, num(s.r)); continue }
      out.push(0, 'POLYLINE', 8, g.name, 66, 1, 70, s.kind === 'poly' ? 1 : 0, 10, 0, 20, 0, 30, 0)
      for (const [x, y] of s.pts) out.push(0, 'VERTEX', 8, g.name, 10, num(x), 20, num(fy(y)), 30, 0)
      out.push(0, 'SEQEND', 8, g.name)
    }
  out.push(0, 'ENDSEC', 0, 'EOF')
  return out.join('\n') + '\n'
}
