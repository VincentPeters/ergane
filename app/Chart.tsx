'use client'

import { useEffect, useRef, useState } from 'react'
import { bbox, type Path, type Span } from '../src/core/geometry'
import { pathData } from '../src/core/svg'

// On-screen variants of the cut layers, lightened so they read on chart navy.
// Export keeps the pure machine colours; see src/core/svg.ts.
const LASER = { outer: '#ff6a5c', inner: '#4fdc8c', engrave: '#8fa8ff' }
const PX_PER_MM = 96 / 25.4
const MIN_LABEL_PX = 11
const LEGEND_PX = 40 // the plot stays clear of the legend strip

export type Fault = { span: Span; label: string; edge: boolean }
export type ChartProps = {
  paths: Path[]
  nominal: { w: number; h: number } // part size before kerf, for the dimension lines
  pitch: number
  kerf: number
  laser: boolean
  zoom: 'fit' | 'true'
  annotate: boolean // rulers, dimensions, leaders and the figure; off for the coupon
  faults: Fault[]
  corner: number // outline corner radius, so the selection ring follows the part
}

// Rounded so server and browser render identical attributes (Math.cos differs in the last digits).
const r4 = (n: number) => Math.round(n * 1e4) / 1e4

export function Chart({ paths, nominal, pitch, kerf, laser, zoom, annotate, faults, corner }: ChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight - LEGEND_PX }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const raw = bbox(paths)
  const b = { x: r4(raw.x), y: r4(raw.y), w: r4(raw.w), h: r4(raw.h) }
  // Narrow plates keep only what the part needs: outline, holes, overall dimensions and faults.
  // Rulers, leaders, pitch note and the figure would otherwise shrink the part to a sliver.
  const compact = box.w > 0 && box.w < 560
  const full = annotate && !compact
  // Room for the left ruler labels, the top ruler and notes, the right and bottom dimensions.
  const pad = (u: number) => compact
    ? { x: r4(b.x - 3 * u), y: r4(b.y - 4 * u), w: r4(b.w + 13 * u), h: r4(b.h + 10 * u) }
    : { x: r4(b.x - 12 * u), y: r4(b.y - 10 * u), w: r4(b.w + 25 * u), h: r4(b.h + 18 * u) }
  const pxPerMm = (v: { w: number; h: number }) =>
    zoom === 'true' || !box.w ? PX_PER_MM : Math.min(box.w / v.w, box.h / v.h)

  // The annotation unit grows until labels reach MIN_LABEL_PX on screen; a few passes settle the fit.
  let u = Math.max(b.w, b.h) / 50
  let vb = pad(u)
  for (let i = 0; i < 3; i++) {
    u = Math.max(Math.max(b.w, b.h) / 50, MIN_LABEL_PX / pxPerMm(vb) / 1.15)
    vb = pad(u)
  }
  u = r4(u)
  const px = pxPerMm(vb)
  const fs = r4(1.15 * u)

  const circles = paths.flatMap((p) => (p.shape.kind === 'circle' ? [p.shape] : []))
  const ink = (op: Path['op']) => (laser ? LASER[op] : op === 'engrave' ? 'var(--chalk-dim)' : 'var(--chalk)')

  // Ruler marks every two pitches (every pitch on a short axis), thinned until labels have room.
  const marks = (len: number) => {
    let step = len <= pitch * 4 ? pitch : pitch * 2
    while (step * px < 36) step *= 2
    const out: number[] = []
    for (let x = 0; x < len - step / 4; x += step) out.push(r4(x))
    // The origin always stays; the end mark only when it has room beside the last mark.
    if ((len - out[out.length - 1]) * px >= 24) out.push(r4(len))
    return out
  }
  const tickLabel = (v: number) => String(Number(v.toFixed(1)))

  // Constellation lines: every pair of holes exactly one pitch apart, so arms, arcs and rings
  // are traced along their real neighbours, never across open space. Sorted by x for a short sweep.
  const byX = [...circles].sort((a, b) => a.cx - b.cx)
  let constellation = ''
  for (let i = 0; i < byX.length; i++)
    for (let j = i + 1; j < byX.length && byX[j].cx - byX[i].cx <= pitch + 0.01; j++)
      if (Math.abs(Math.hypot(byX[j].cx - byX[i].cx, byX[j].cy - byX[i].cy) - pitch) < 0.01)
        constellation += `M${r4(byX[i].cx)} ${r4(byX[i].cy)}L${r4(byX[j].cx)} ${r4(byX[j].cy)}`

  // Notes above the part only point at holes in its top row, so leaders never cross the part.
  const topY = Math.min(...circles.map((c) => r4(c.cy)))
  const topRow = circles.filter((c) => r4(c.cy) === topY).sort((a, b) => a.cx - b.cx)
  // One ø leader per distinct hole size, which doubles as the magnitude key on mixed parts.
  const bySize = new Map<number, (typeof circles)[number]>()
  for (const c of topRow) if (!bySize.has(r4(c.r))) bySize.set(r4(c.r), c) // first hole of each size
  const leaders = [...bySize.values()].slice(0, 2)
  // Pitch note on the middle pair of the top row, and only when that pair really is one pitch apart:
  // the label owns holes 1–2, leaders the first holes, faults the last.
  const mid = Math.max(1, Math.floor(topRow.length / 2))
  const [p1, p2] = topRow.slice(mid - 1, mid + 1)
  const pitchPair = p1 && p2 && Math.abs(p2.cx - p1.cx - pitch) < 0.01

  const size = zoom === 'true' ? { width: `${vb.w}mm`, height: `${vb.h}mm` } : undefined

  return (
    <div className={`plate ${zoom}${laser ? ' laser' : ''}`} ref={ref}>
      {full && <Owl />}
      <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={size} role="img"
        aria-label={`Preview, ${nominal.w.toFixed(2)} by ${nominal.h.toFixed(2)} millimetres, ${circles.length} holes`}>
        <defs>
          <pattern id="pitch" width={pitch} height={pitch} patternUnits="userSpaceOnUse" x={circles[0]?.cx ?? 0} y={circles[0]?.cy ?? 0}>
            <path d={`M${pitch} 0V${pitch}M0 ${pitch}H${pitch}`} className="grid" />
          </pattern>
        </defs>
        {/* Oversized so the grid fills the whole plate, not just the fitted viewBox. */}
        <rect x={vb.x - 5 * vb.w} y={vb.y - 5 * vb.h} width={11 * vb.w} height={11 * vb.h} fill="url(#pitch)" />

        {full && (
          <g className="ruler" fontSize={fs}>
            <path d={`M0 ${-6 * u}H${nominal.w}`} />
            {marks(nominal.w).map((x) => (
              <g key={x}><path d={`M${x} ${-6 * u}v${-u}`} /><text x={x} y={-7.6 * u} textAnchor="middle">{tickLabel(x)}</text></g>
            ))}
            <path d={`M${-6 * u} 0V${nominal.h}`} />
            {marks(nominal.h).map((y) => (
              <g key={y}><path d={`M${-6 * u} ${y}h${-u}`} /><text x={-7.6 * u} y={y + fs / 3} textAnchor="end">{tickLabel(y)}</text></g>
            ))}
          </g>
        )}

        <rect className="ring" x={b.x - 1.5 * u} y={b.y - 1.5 * u} width={b.w + 3 * u} height={b.h + 3 * u} rx={r4(corner + 1.5 * u)} />
        {!laser && annotate && <path className="constellation" d={constellation} />}

        {paths.map((p, i) => {
          const s = p.shape
          if (s.kind === 'circle')
            return (
              <g key={i}>
                <circle cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={ink('inner')} className="stroke" />
                <circle className="mag" cx={s.cx} cy={s.cy} r={r4(s.r * 0.5)} />
              </g>
            )
          return <path key={i} d={pathData(s)} fill={p.op === 'outer' && !laser ? 'var(--part-fill)' : 'none'} stroke={ink(p.op)} className="stroke" />
        })}

        {annotate && (
          <g className="note" fontSize={fs}>
            <path d={`M0 ${nominal.h + 2 * u}v${4 * u}M${nominal.w} ${nominal.h + 2 * u}v${4 * u}M0 ${nominal.h + 5 * u}H${nominal.w}`} />
            <text x={nominal.w / 2} y={nominal.h + 4.4 * u} textAnchor="middle">{nominal.w.toFixed(2)}</text>
            <path d={`M${nominal.w + 2 * u} 0h${4 * u}M${nominal.w + 2 * u} ${nominal.h}h${4 * u}M${nominal.w + 5 * u} 0V${nominal.h}`} />
            <text x={nominal.w + 6 * u} y={nominal.h / 2 + fs / 3}>{nominal.h.toFixed(2)}</text>
            {full && pitchPair && (
              <>
                <path d={`M${p1.cx} ${p1.cy - p1.r - u}V${-2.4 * u}M${p2.cx} ${p2.cy - p2.r - u}V${-2.4 * u}M${p1.cx} ${-3 * u}H${p2.cx}`} />
                <text x={(p1.cx + p2.cx) / 2} y={-3.6 * u} textAnchor="middle">{pitch} pitch</text>
              </>
            )}
            {full && leaders.map((c, k) => {
              const dir = k === 0 ? -1 : 1
              const ex = c.cx + dir * 2.5 * u
              // The cut diameter: the drawn radius plus the half kerf it was shrunk by.
              return (
                <g key={k}>
                  <path d={`M${c.cx + dir * c.r * 0.71} ${c.cy - c.r * 0.71}L${ex} ${-2 * u}`} />
                  <text className="it-num" x={ex} y={-2.4 * u} textAnchor={k === 0 ? 'end' : 'start'}>ø {(2 * c.r + kerf).toFixed(2)}</text>
                </g>
              )
            })}
          </g>
        )}

        {faults.map((f, i) => {
          const [x1, y1, x2, y2] = f.span
          // Hole webs label below the span. Edge webs label outward, past the dashed ring at 1.5u.
          const len = Math.hypot(x2 - x1, y2 - y1) || 1
          const dx = (x2 - x1) / len, dy = (y2 - y1) / len
          const tx = f.edge ? x2 + dx * 3.4 * u : (x1 + x2) / 2
          const ty = f.edge ? y2 + dy * 3.4 * u + (dy < 0 ? 0 : fs * 0.8) : Math.max(y1, y2) + 2.6 * u
          const anchor = f.edge && Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'start' : 'end') : 'middle'
          return (
            <g key={i} className="fault" fontSize={fs}>
              <path d={`M${x1} ${y1}L${x2} ${y2}`} />
              <circle cx={x1} cy={y1} r={r4(0.35 * u)} /><circle cx={x2} cy={y2} r={r4(0.35 * u)} />
              <text x={tx} y={ty} textAnchor={anchor}>{f.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        {laser ? (
          <>
            <span><b style={{ background: LASER.outer }} />outer cut</span>
            <span><b style={{ background: LASER.inner }} />inner cut</span>
            <span><b style={{ background: LASER.engrave }} />engrave</span>
          </>
        ) : (
          <>
            <span><b style={{ background: 'var(--chalk)' }} />outline</span>
            <span><b className="dot" />hole, dot grows with ø</span>
            <span><b style={{ background: 'var(--amber)' }} />dimension, mm</span>
            <span><b style={{ background: 'var(--grid)' }} />{pitch} mm grid</span>
          </>
        )}
        {faults.length > 0 && <span className="err"><b style={{ background: 'var(--err)' }} />web below minimum</span>}
        <span className="scale">Scale {box.w || zoom === 'true' ? (px / PX_PER_MM).toFixed(1) : '…'} : 1</span>
      </div>
    </div>
  )
}

// Ergane's owl, engraved in hairlines behind the plate the way a star atlas sets its figure under the field.
// Engraving built the way a plate engraver shades: contour lines follow the body, the wings are
// ruled in parallel feather lines, the facial discs radiate, and diagonal hatching carries the shadow side.
const BODY = 'M0 -38C14 -38 22 -26 22 -10C22 12 14 30 0 40C-14 30 -22 12 -22 -10C-22 -26 -14 -38 0 -38Z'
const fx = (n: number) => Math.round(n * 100) / 100
const CONTOURS = [0.84, 0.68, 0.52]
const WINGS = [0, 1.6, 3.2, 4.8, 6.4].map((o) =>
  `M${-22 + o} ${-6 + o}C${-17 + o} ${6 + o} ${-15 + o} ${20} ${-8 + o * 0.6} ${34 - o * 0.4}` +
  `M${22 - o} ${-6 + o}C${17 - o} ${6 + o} ${15 - o} ${20} ${8 - o * 0.6} ${34 - o * 0.4}`).join('')
const DISC = [-8, 8].flatMap((cx) => Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2
  return `M${fx(cx + Math.cos(a) * 7.6)} ${fx(-22 + Math.sin(a) * 7.6)}L${fx(cx + Math.cos(a) * 10)} ${fx(-22 + Math.sin(a) * 10)}`
})).join('')
const SHADOW = Array.from({ length: 22 }, (_, i) => `M${-4 + i * 1.5} -40l-24 84`).join('')
const BREAST = [-2, 4, 10, 16, 22, 28].flatMap((y, row) =>
  [-10, -6, -2, 2, 6, 10].map((x) => `M${x + (row % 2) * 2} ${y}l1 2.6l1 -2.6`)).join('')

function Owl() {
  return (
    <svg className="figure" viewBox="-40 -50 80 104" aria-hidden="true">
      <defs><clipPath id="owl-body"><path d={BODY} /></clipPath></defs>
      <path d={BODY} />
      {CONTOURS.map((s) => <path key={s} transform={`translate(0 ${fx(2 * (1 - s))}) scale(${s})`} d={BODY} />)}
      <g clipPath="url(#owl-body)"><path d={SHADOW} className="shade" /><path d={BREAST} /></g>
      <path d={WINGS} />
      <path d="M-14 -33L-18 -44L-8 -36M14 -33L18 -44L8 -36M-12 -34L-15 -41M12 -34L15 -41" />
      <path d={DISC} />
      <circle cx="-8" cy="-22" r="7" /><circle cx="-8" cy="-22" r="4.4" /><circle cx="-8" cy="-22" r="1.2" />
      <circle cx="8" cy="-22" r="7" /><circle cx="8" cy="-22" r="4.4" /><circle cx="8" cy="-22" r="1.2" />
      <path d="M-2 -14L0 -9L2 -14" />
      <path d="M-34 44H34M-34 46H34M-7 38v6M-3 39v5M3 39v5M7 38v6" />
    </svg>
  )
}

export function OwlMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M5 7l3 3M21 7l-3 3" /><ellipse cx="13" cy="15" rx="8" ry="9" />
      <circle cx="9.5" cy="13" r="2.6" /><circle cx="16.5" cy="13" r="2.6" />
      <circle cx="9.5" cy="13" r=".9" fill="var(--amber)" stroke="none" /><circle cx="16.5" cy="13" r=".9" fill="var(--amber)" stroke="none" />
      <path d="M12 17l1 1.6 1-1.6" />
    </svg>
  )
}
