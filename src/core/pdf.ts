// Minimal vector PDF writer for print preview and documentation: one page per sheet, real size.
import { bbox, type Path } from './geometry'
import { exportGroups, type ExportOpts } from './svg'

const PT = 72 / 25.4 // points per mm
const K = 0.5523 // cubic Bézier handle length for a quarter circle
const n = (v: number) => String(+v.toFixed(3))

function rgb(hex: string) {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => n(c / 255)).join(' ')
}

function content(paths: Path[], w: number, h: number, ox: number, oy: number, opts: ExportOpts) {
  const X = (x: number) => n((x - ox) * PT), Y = (y: number) => n((h - (y - oy)) * PT)
  const ops: string[] = ['0.25 w 1 J 1 j']
  for (const g of exportGroups(paths, opts)) {
    ops.push(`${rgb(g.color)} RG`)
    for (const p of g.items) {
      const s = p.shape
      if (s.kind === 'circle') {
        const { cx, cy, r } = s, k = r * K
        ops.push(`${X(cx + r)} ${Y(cy)} m`,
          `${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c`,
          `${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c`,
          `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c`,
          `${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c S`)
      } else {
        ops.push(s.pts.map(([x, y], i) => `${X(x)} ${Y(y)} ${i ? 'l' : 'm'}`).join(' ') + (s.kind === 'poly' ? ' h S' : ' S'))
      }
    }
  }
  return ops.join('\n')
}

/** One page per entry; each page is the sheet size (or the parts' bounds) at 1:1. */
export function toPDF(pages: { paths: Path[]; sheet?: { w: number; h: number } }[], opts: ExportOpts = {}): string {
  const objs: string[] = []
  const add = (s: string) => objs.push(s) // object number = index + 1
  add('<< /Type /Catalog /Pages 2 0 R >>')
  add('') // pages tree, filled in once the kids are known
  const kids: number[] = []
  for (const pg of pages) {
    const b = pg.sheet ? { x: 0, y: 0, w: pg.sheet.w, h: pg.sheet.h } : bbox(pg.paths)
    const stream = content(pg.paths, b.w, b.h, b.x, b.y, opts)
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(b.w * PT)} ${n(b.h * PT)}] /Contents ${objs.length} 0 R >>`)
    kids.push(objs.length)
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  let pdf = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = pdf.length
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}
