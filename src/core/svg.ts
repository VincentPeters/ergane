import { bbox, type Op, type Path } from './geometry'

// Cut order: engrave, inner cuts, outer cuts. Parts stay in place while holes are cut.
const LAYERS: [Op, string, string][] = [
  ['engrave', 'engrave', '#0000FF'],
  ['inner', 'cut-inner', '#00FF00'],
  ['outer', 'cut-outer', '#FF0000'],
]

const f = (n: number) => +n.toFixed(4)

function shape(p: Path) {
  const s = p.shape
  if (s.kind === 'circle') return `<circle cx="${f(s.cx)}" cy="${f(s.cy)}" r="${f(s.r)}"/>`
  return `<path d="M${s.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z"/>`
}

export function toSVG(paths: Path[]): string {
  const b = bbox(paths)
  const groups = LAYERS.map(([op, name, color]) => {
    const items = paths.filter((p) => p.op === op)
    if (!items.length) return ''
    return `<g id="${name}" inkscape:groupmode="layer" inkscape:label="${name}" fill="none" stroke="${color}" stroke-width="0.01">${items.map(shape).join('')}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(b.w)}mm" height="${f(b.h)}mm" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}">${groups}</svg>`
}
