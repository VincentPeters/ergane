// Single-stroke font for engraving. Each glyph is strokes on a 4 x 6 grid (y down), ";" separates strokes.
// Single strokes engrave as one pass of lines, unlike outline fonts that need filling.
const GLYPHS: Record<string, string> = {
  // Unslashed, octagonal zero: a slash would read as diameter notation next to holes, a square as O.
  '0': '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0',
  '1': '1,1 2,0 2,6;1,6 3,6',
  '2': '0,0 4,0 4,3 0,3 0,6 4,6',
  '3': '0,0 4,0 4,6 0,6;0,3 4,3',
  '4': '0,0 0,3 4,3;4,0 4,6',
  '5': '4,0 0,0 0,3 4,3 4,6 0,6',
  '6': '4,0 0,0 0,6 4,6 4,3 0,3',
  '7': '0,0 4,0 1,6',
  '8': '0,0 4,0 4,6 0,6 0,0;0,3 4,3',
  '9': '4,3 0,3 0,0 4,0 4,6 0,6',
  '.': '2,5.4 2,6',
  '-': '1,3 3,3',
  '+': '1,3 3,3;2,2 2,4',
  'x': '1,2 3,6;3,2 1,6',
  ' ': '',
  A: '0,6 0,0 4,0 4,6;0,3 4,3',
  B: '0,0 3,0 4,1 4,2 3,3 0,3;3,3 4,4 4,5 3,6 0,6 0,0',
  C: '4,0 0,0 0,6 4,6',
  D: '0,0 3,0 4,1 4,5 3,6 0,6 0,0',
  E: '4,0 0,0 0,6 4,6;0,3 3,3',
  F: '4,0 0,0 0,6;0,3 3,3',
  G: '4,0 0,0 0,6 4,6 4,3 2,3',
  H: '0,0 0,6;4,0 4,6;0,3 4,3',
  I: '1,0 3,0;2,0 2,6;1,6 3,6',
  J: '4,0 4,6 0,6 0,4',
  K: '0,0 0,6;4,0 0,3 4,6',
  L: '0,0 0,6 4,6',
  M: '0,6 0,0 2,3 4,0 4,6',
  N: '0,6 0,0 4,6 4,0',
  O: '0,0 4,0 4,6 0,6 0,0',
  P: '0,6 0,0 4,0 4,3 0,3',
  Q: '0,0 4,0 4,6 0,6 0,0;2,4 4,6',
  R: '0,6 0,0 4,0 4,3 0,3 4,6',
  S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
  T: '0,0 4,0;2,0 2,6',
  U: '0,0 0,6 4,6 4,0',
  V: '0,0 2,6 4,0',
  W: '0,0 1,6 2,3 3,6 4,0',
  X: '0,0 4,6;4,0 0,6',
  Y: '0,0 2,3 4,0;2,3 2,6',
  Z: '0,0 4,0 0,6 4,6',
}
const ADVANCE = 5 // glyph width 4 plus 1 spacing

const glyph = (c: string) => GLYPHS[c] ?? GLYPHS[c.toUpperCase()]

/** Width in mm of `s` at cap height `h`. Unknown characters are dropped. */
export function textWidth(s: string, h: number) {
  const n = [...s].filter(glyph).length
  return n ? ((n * ADVANCE - 1) * h) / 6 : 0
}

/** Open polylines for `s`, centred on (cx, cy), cap height `h` mm. */
export function text(s: string, cx: number, cy: number, h: number): [number, number][][] {
  const k = h / 6
  const x0 = cx - textWidth(s, h) / 2
  const y0 = cy - h / 2
  const out: [number, number][][] = []
  ;[...s].filter(glyph).forEach((c, n) => {
    for (const stroke of glyph(c).split(';').filter(Boolean))
      out.push(stroke.split(' ').map((p) => {
        const [x, y] = p.split(',').map(Number)
        return [x0 + (n * ADVANCE + x) * k, y0 + y * k]
      }))
  })
  return out
}
