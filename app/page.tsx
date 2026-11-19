'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  FIT_OFFSET, HOLES, MATERIALS, PROFILES, RULE_COUNT, bbox, couponKerfs, defaultMix, generate, measure, validate,
  type Ctx, type Fit, type HoleMix, type Part, type Pattern,
} from '../src/core/geometry'
import { toSVG } from '../src/core/svg'
import { Chart, OwlMark, type Fault } from './Chart'

type Kind = Part['type']
const LIBRARY: { group: string; items: { kind: Kind; name: string }[] }[] = [
  { group: 'Structural', items: [{ kind: 'strip', name: 'Strip' }, { kind: 'plate', name: 'Plate' }] },
  { group: 'Calibration', items: [{ kind: 'coupon', name: 'Coupon' }] },
]
const MIXES: { id: HoleMix; name: string }[] = [
  { id: 'all-m3', name: 'All M3' },
  { id: 'all-technic', name: 'All Technic' },
  { id: 'alternating', name: 'Alternating' },
  { id: 'border-technic', name: 'Technic border, M3 inside' },
]

// Calibrated kerf per material lives in this browser only. Reads and writes may throw in private modes.
const KERF_KEY = 'cutgrid.kerf.v1'
function loadKerfs(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(KERF_KEY) ?? '{}') } catch { return {} }
}
function saveKerfs(k: Record<string, number>) {
  try { localStorage.setItem(KERF_KEY, JSON.stringify(k)) } catch { /* not persisted, still works */ }
}

// Number inputs keep what the user types; values are clamped only when building the part.
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v) || min))
const mm = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–')

export default function Page() {
  const [kind, setKind] = useState<Kind>('strip')
  const [strip, setStrip] = useState({ holes: 11, rows: 1 })
  const [plate, setPlate] = useState({ cols: 5, rows: 5, pattern: 'full' as Pattern, radius: 2 })
  const [label, setLabel] = useState(true)
  const [profileId, setProfileId] = useState(PROFILES[0].id)
  const [mix, setMix] = useState<HoleMix>('all-m3')
  const [materialId, setMaterialId] = useState(MATERIALS[0].id)
  const [kerfs, setKerfs] = useState<Record<string, number>>({})
  const [fit, setFit] = useState<Fit>('normal')
  const [laser, setLaser] = useState(false)
  const [zoom, setZoom] = useState<'fit' | 'true'>('fit')
  const [best, setBest] = useState<number | null>(null)

  useEffect(() => setKerfs(loadKerfs()), [])

  const profile = PROFILES.find((p) => p.id === profileId)!
  const base = MATERIALS.find((m) => m.id === materialId)!
  const calibrated = materialId in kerfs
  const kerf = kerfs[materialId] ?? base.kerf
  const setKerf = (v: number) => {
    if (!Number.isFinite(v) || v < 0 || v > 1) return
    const next = { ...kerfs, [materialId]: v }
    setKerfs(next)
    saveKerfs(next)
  }

  const part: Part =
    kind === 'strip' ? { type: 'strip', holes: clamp(strip.holes, 2, 50), rows: clamp(strip.rows, 1, 3), label }
    : kind === 'plate' ? { type: 'plate', cols: clamp(plate.cols, 2, 50), rows: clamp(plate.rows, 2, 50), pattern: plate.pattern, radius: Math.max(0, plate.radius || 0), label }
    : { type: 'coupon' }
  const ctx: Ctx = { profile, material: { ...base, kerf }, fit, holeMix: mix }

  const key = JSON.stringify([part, ctx])
  const paths = useMemo(() => generate(part, ctx), [key])
  const svg = useMemo(() => toSVG(paths), [paths])
  const issues = validate(part, ctx)
  const m = part.type === 'coupon' ? null : measure(part, ctx)
  // Failing webs are drawn on the plot where they occur, not only listed in the column.
  const faults: Fault[] = !m ? [] : issues.flatMap((i) => {
    const span = i.rule === 'hole-web' ? m.holeSpan : m.edgeSpan
    const web = i.rule === 'hole-web' ? m.holeWeb : m.edgeWeb
    return span ? [{ span, label: `${web.toFixed(2)} < ${base.minWeb}`, edge: i.rule === 'edge-web' }] : []
  })
  const outer = bbox(paths.filter((p) => p.op === 'outer'))
  const nominal = m ?? { w: outer.w - kerf, h: outer.h - kerf }
  const holeCount = paths.filter((p) => p.shape.kind === 'circle').length
  const title = part.type === 'strip' ? `Strip, ${part.holes} holes` : part.type === 'plate' ? `Plate ${part.cols} × ${part.rows}` : 'Calibration coupon'
  const file = part.type === 'strip' ? `strip-${part.holes}` : part.type === 'plate' ? `plate-${part.cols}x${part.rows}` : `coupon-${materialId}`

  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    Object.assign(document.createElement('a'), { href: url, download: `${file}.svg` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><OwlMark />Cutgrid <small>open design</small></div>
        <label className="f">Grid
          <select value={profileId} onChange={(e) => {
            const p = PROFILES.find((x) => x.id === e.target.value)!
            setProfileId(p.id)
            setMix(defaultMix(p))
          }}>
            {PROFILES.map((p) => <option key={p.id}>{p.id}</option>)}
          </select>
        </label>
        <label className="f">Material
          <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setBest(null) }}>
            {MATERIALS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="f">Kerf
          <span className="unit"><KerfInput value={kerf} onCommit={setKerf} />mm</span>
          <span id="kerf-src" className={calibrated ? 'src cal' : 'src'}>{calibrated ? 'calibrated' : 'preset'}</span>
        </label>
        <label className="f">Fit
          <select value={fit} onChange={(e) => setFit(e.target.value as Fit)}>
            <option value="loose">Loose</option><option value="normal">Normal</option><option value="tight">Tight</option>
          </select>
        </label>
        <span className="sp" />
        <button className="link" onClick={() => setKind('coupon')}>Calibrate</button>
        <button className="primary" onClick={download} disabled={issues.length > 0}
          title={issues.length ? 'Fix the failed rules first' : `Download ${file}.svg`}>Export SVG</button>
      </header>

      <nav className="library" aria-label="Element library">
        {LIBRARY.map((g) => (
          <section key={g.group}>
            <h2 className="it">{g.group}</h2>
            <ul>
              {g.items.map((it) => (
                <li key={it.kind}>
                  <button aria-pressed={kind === it.kind} onClick={() => setKind(it.kind)}>
                    {it.name}
                    {kind === it.kind && part.type !== 'coupon' && <span>{holeCount} h</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <p className="soon">Slotted strips, angles, joints and mounting plates follow in the next milestones.</p>
      </nav>

      <main className="stage">
        <div className="bar">
          <h1 className="it">{title}</h1>
          <span className="meta">{mm(nominal.w)} × {mm(nominal.h)} mm · {holeCount} holes</span>
          <span className="sp" />
          <div className="seg" role="group" aria-label="Zoom">
            <button aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Fit</button>
            <button aria-pressed={zoom === 'true'} onClick={() => setZoom('true')}>1 : 1</button>
          </div>
          <label className="switch">
            <input type="checkbox" checked={laser} onChange={(e) => setLaser(e.target.checked)} />
            <span aria-hidden="true" />Laser colours
          </label>
        </div>
        <Chart paths={paths} nominal={nominal} pitch={profile.pitch} kerf={kerf} laser={laser} zoom={zoom}
          annotate={part.type !== 'coupon'} faults={faults} />
      </main>

      <aside className="form" aria-label="Parameters">
        {part.type === 'coupon' ? (
          <Coupon kerf={kerf} best={best} setBest={setBest} material={base.name}
            rows={profile.mixable ? 'M3 and Technic rows' : `${HOLES[profile.hole].name} row`}
            onUse={(k) => { setKerf(k); setBest(null) }} />
        ) : (
          <>
            <h2 className="it">Parameters</h2>
            {kind === 'strip' ? (
              <>
                <Num label="Holes" hint="2–50" value={strip.holes} onChange={(holes) => setStrip({ ...strip, holes })} />
                <Num label="Rows" hint="1–3" value={strip.rows} onChange={(rows) => setStrip({ ...strip, rows })} />
              </>
            ) : (
              <>
                <Num label="Columns" hint="2–50" value={plate.cols} onChange={(cols) => setPlate({ ...plate, cols })} />
                <Num label="Rows" hint="2–50" value={plate.rows} onChange={(rows) => setPlate({ ...plate, rows })} />
                <Num label="Corner radius" hint="mm" step={0.5} value={plate.radius} onChange={(radius) => setPlate({ ...plate, radius })} />
                <label className="row">Hole pattern
                  <select value={plate.pattern} onChange={(e) => setPlate({ ...plate, pattern: e.target.value as Pattern })}>
                    <option value="full">Full</option><option value="border">Border</option><option value="checker">Checker</option>
                  </select>
                </label>
              </>
            )}
            {profile.mixable && (
              <label className="row">Hole mix
                <select value={mix} onChange={(e) => setMix(e.target.value as HoleMix)}>
                  {MIXES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            )}
            <label className="row check">Engraved label
              <input type="checkbox" checked={label} onChange={(e) => setLabel(e.target.checked)} />
            </label>

            <h2 className="it">Measured</h2>
            <dl>
              {[
                ['Length', m!.w, false],
                ['Width', m!.h, false],
                ...m!.types.map((t) => [`Hole ø ${HOLES[t].name}`, HOLES[t].d + FIT_OFFSET[fit], false] as const),
                ['Edge web', m!.edgeWeb, issues.some((i) => i.rule === 'edge-web')],
                ['Hole web', m!.holeWeb, issues.some((i) => i.rule === 'hole-web')],
                [`Min web, ${base.name}`, base.minWeb, false],
              ].map(([k, v, bad]) => (
                <div key={k as string} className={bad ? 'bad' : ''}><dt>{k}</dt><dd>{mm(v as number)}<u>mm</u></dd></div>
              ))}
            </dl>

            {issues.length === 0 ? (
              <p className="status ok"><i />All rules pass<small>{RULE_COUNT} / {RULE_COUNT}</small></p>
            ) : (
              <div className="status bad" role="alert">
                <p><i />Export blocked<small>{RULE_COUNT - issues.length} / {RULE_COUNT}</small></p>
                <ul>{issues.map((i) => <li key={i.rule}>{i.message}</li>)}</ul>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  )
}

// Kerf is the most consequential number on screen, so it always reads "0.20": a number input would
// follow the browser locale ("0,2"). Accepts either separator; settles to two decimals on blur.
function KerfInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(value.toFixed(2))
  const parse = (s: string) => Number(s.trim().replace(',', '.'))
  // Follow outside changes (material switch, coupon result) without fighting a half-typed "0." draft.
  useEffect(() => { if (parse(draft) !== value) setDraft(value.toFixed(2)) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input type="text" inputMode="decimal" className="num" value={draft} aria-describedby="kerf-src" aria-label="Kerf in millimetres"
      onChange={(e) => {
        setDraft(e.target.value)
        const v = parse(e.target.value)
        if (e.target.value.trim() && Number.isFinite(v) && v >= 0 && v <= 1) onCommit(v)
      }}
      onBlur={() => setDraft(value.toFixed(2))} />
  )
}

function Num(props: { label: string; hint: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="row">
      <span>{props.label} <small>{props.hint}</small></span>
      <input type="number" value={Number.isFinite(props.value) ? props.value : ''} step={props.step ?? 1}
        onChange={(e) => props.onChange(e.target.valueAsNumber)} />
    </label>
  )
}

function Coupon(props: {
  kerf: number; best: number | null; setBest: (k: number) => void; onUse: (k: number) => void; material: string; rows: string
}) {
  const options = couponKerfs(props.kerf)
  return (
    <>
      <h2 className="it">Calibrate kerf</h2>
      <ol className="steps">
        <li>Export this coupon and cut it in {props.material}.</li>
        <li>Push a bolt through each hole of the {props.rows}.</li>
        <li>Find the smallest hole the bolt passes without force. Its engraved label is your kerf.</li>
      </ol>
      <h2 className="it">Best-fitting label</h2>
      <div className="labels" role="radiogroup" aria-label="Best-fitting hole label">
        {options.map((k) => (
          <button key={k} role="radio" aria-checked={props.best === k} onClick={() => props.setBest(k)}>{k.toFixed(2)}</button>
        ))}
      </div>
      <button className="primary wide" disabled={props.best === null} onClick={() => props.best !== null && props.onUse(props.best)}>
        {props.best === null ? 'Pick a label first' : `Use ${props.best.toFixed(2)} mm as kerf`}
      </button>
      <p className="note-text">Labels are centred on the current kerf, {props.kerf.toFixed(2)} mm. The result is saved in this browser for {props.material}.</p>
    </>
  )
}
