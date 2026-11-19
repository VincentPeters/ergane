'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ANGLES, FIT_OFFSET, HOLES, MATERIALS, PROFILES, RULE_COUNT, bbox, clampPart, couponKerfs, defaultMix, generate, measure, validate,
  type Ctx, type Fit, type GridPart, type HoleMix, type Part,
} from '../src/core/geometry'
import { toSVG } from '../src/core/svg'
import { Chart, OwlMark, type Fault } from './Chart'

type Kind = Part['type']
type ShapeKind = Exclude<Kind, 'coupon'>
type Value = number | string
type Field = { key: string; label: string; hint?: string; step?: number; options?: [Value, string][] }

// One description per shape drives the library, the parameter form and the defaults.
// The core clamps every value, so the form only collects what was typed.
const SHAPES: Record<ShapeKind, { name: string; group: string; defaults: Record<string, Value>; fields: Field[] }> = {
  strip: { name: 'Strip', group: 'Structural', defaults: { holes: 11, rows: 1 }, fields: [
    { key: 'holes', label: 'Holes', hint: '2–50' }, { key: 'rows', label: 'Rows', hint: '1–3' }] },
  slotted: { name: 'Slotted strip', group: 'Structural', defaults: { holes: 7, slot: 2 }, fields: [
    { key: 'holes', label: 'Holes', hint: '4–50' }, { key: 'slot', label: 'Slot length', hint: 'pitches' }] },
  plate: { name: 'Plate', group: 'Structural', defaults: { cols: 5, rows: 5, radius: 2, pattern: 'full' }, fields: [
    { key: 'cols', label: 'Columns', hint: '2–50' }, { key: 'rows', label: 'Rows', hint: '2–50' },
    { key: 'radius', label: 'Corner radius', hint: 'mm', step: 0.5 },
    { key: 'pattern', label: 'Hole pattern', options: [['full', 'Full'], ['border', 'Border'], ['checker', 'Checker']] }] },
  angle: { name: 'Angle strip', group: 'Structural', defaults: { armA: 5, armB: 5, angle: 90 }, fields: [
    { key: 'armA', label: 'Arm A', hint: 'holes' }, { key: 'armB', label: 'Arm B', hint: 'holes' },
    { key: 'angle', label: 'Angle', options: ANGLES.map((a) => [a, `${a}°`]) }] },
  gusset: { name: 'Gusset', group: 'Structural', defaults: { holes: 4 }, fields: [
    { key: 'holes', label: 'Holes per leg', hint: '2–25' }] },
  frame: { name: 'Frame', group: 'Structural', defaults: { cols: 7, rows: 5, border: 1 }, fields: [
    { key: 'cols', label: 'Columns', hint: '3–50' }, { key: 'rows', label: 'Rows', hint: '3–50' },
    { key: 'border', label: 'Border', hint: 'holes' }] },
  connector: { name: 'Connector', group: 'Connectors', defaults: { shape: 'X', arm: 2 }, fields: [
    { key: 'shape', label: 'Shape', options: [['T', 'T'], ['X', 'X'], ['H', 'H'], ['Y', 'Y']] },
    { key: 'arm', label: 'Arm length', hint: 'holes' }] },
  disc: { name: 'Disc', group: 'Round', defaults: { diameter: 5, count: 8 }, fields: [
    { key: 'diameter', label: 'Diameter', hint: 'pitches' }, { key: 'count', label: 'Ring holes', hint: '3–24' }] },
  curved: { name: 'Curved strip', group: 'Round', defaults: { radius: 6, angle: 90 }, fields: [
    { key: 'radius', label: 'Radius', hint: 'pitches' }, { key: 'angle', label: 'Arc', hint: 'degrees' }] },
  bracket: { name: 'Corner bracket', group: 'Joints', defaults: { cols: 5, base: 3, height: 3 }, fields: [
    { key: 'cols', label: 'Width', hint: 'holes' }, { key: 'base', label: 'Base', hint: 'holes' },
    { key: 'height', label: 'Upright', hint: 'holes' }] },
  box: { name: 'Box', group: 'Joints', defaults: { cols: 5, rows: 4, height: 3, lid: 'closed' }, fields: [
    { key: 'cols', label: 'Width', hint: 'holes' }, { key: 'rows', label: 'Depth', hint: 'holes' },
    { key: 'height', label: 'Height', hint: 'holes' },
    { key: 'lid', label: 'Lid', options: [['closed', 'Closed'], ['open', 'Open top']] }] },
  spacer: { name: 'Spacers', group: 'Joints', defaults: { outer: 8, quantity: 6 }, fields: [
    { key: 'outer', label: 'Outer diameter', hint: 'mm', step: 0.5 }, { key: 'quantity', label: 'Quantity', hint: '1–48' }] },
}
const GROUPS = ['Structural', 'Round', 'Connectors', 'Joints']
const LIBRARY: { group: string; items: { kind: Kind; name: string }[] }[] = [
  ...GROUPS.map((group) => ({
    group,
    items: (Object.keys(SHAPES) as ShapeKind[]).filter((k) => SHAPES[k].group === group).map((kind) => ({ kind, name: SHAPES[kind].name })),
  })),
  { group: 'Calibration', items: [{ kind: 'coupon', name: 'Coupon' }] },
]

// Screen title and export file name for a clamped part.
function describe(p: GridPart, holes: number, pitch: number): [string, string] {
  switch (p.type) {
    case 'strip': return [`Strip, ${p.holes} holes`, `strip-${p.holes}`]
    case 'slotted': return [`Slotted strip, ${p.holes} holes`, `slotted-${p.holes}-${p.slot}`]
    case 'plate': return [`Plate ${p.cols} × ${p.rows}`, `plate-${p.cols}x${p.rows}`]
    case 'angle': return [`Angle strip ${p.armA} + ${p.armB}, ${p.angle}°`, `angle-${p.armA}-${p.armB}-${p.angle}`]
    case 'gusset': return [`Gusset, ${p.holes} per leg`, `gusset-${p.holes}`]
    case 'frame': return [`Frame ${p.cols} × ${p.rows}`, `frame-${p.cols}x${p.rows}`]
    case 'connector': return [`${p.shape} connector, arm ${p.arm}`, `connector-${p.shape.toLowerCase()}${p.arm}`]
    case 'disc': return [`Disc ø ${(p.diameter * pitch).toFixed(1)} mm`, `disc-${p.diameter}-${p.count}`]
    case 'curved': return [`Curved strip, ${holes} holes`, `curved-r${p.radius}-${p.angle}`]
    case 'bracket': return [`Corner bracket ${p.cols} × ${p.base} + ${p.height}`, `bracket-${p.cols}-${p.base}-${p.height}`]
    case 'box': return [`Box ${p.cols} × ${p.rows} × ${p.height}${p.lid === 'open' ? ', open top' : ''}`, `box-${p.cols}x${p.rows}x${p.height}-${p.lid}`]
    case 'spacer': return [`Spacers ø ${p.outer} mm × ${p.quantity}`, `spacers-${p.outer}x${p.quantity}`]
  }
}
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

const mm = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '–')

export default function Page() {
  const [kind, setKind] = useState<Kind>('strip')
  // Inputs keep what the user types (even half-typed values); the core clamps when building the part.
  const [params, setParams] = useState(() =>
    Object.fromEntries((Object.keys(SHAPES) as ShapeKind[]).map((k) => [k, { ...SHAPES[k].defaults }])) as Record<ShapeKind, Record<string, Value>>)
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

  const part: Part = kind === 'coupon' ? { type: 'coupon' } : clampPart({ type: kind, ...params[kind], label } as Part)
  const setParam = (key: string, v: Value) => kind !== 'coupon' && setParams({ ...params, [kind]: { ...params[kind], [key]: v } })
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
  const [title, file] = part.type === 'coupon' ? ['Calibration coupon', `coupon-${materialId}`] : describe(part, holeCount, profile.pitch)
  const elongated = part.type === 'strip' || part.type === 'slotted'

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
        <p className="soon">Captive nut joints and mounting plates follow in the next milestones.</p>
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
          annotate={part.type !== 'coupon'} faults={faults} corner={m?.corner ?? 3} />
      </main>

      <aside className="form" aria-label="Parameters">
        {part.type === 'coupon' ? (
          <Coupon kerf={kerf} best={best} setBest={setBest} material={base.name}
            rows={profile.mixable ? 'M3 and Technic rows' : `${HOLES[profile.hole].name} row`}
            onUse={(k) => { setKerf(k); setBest(null) }} />
        ) : (
          <>
            <h2 className="it">Parameters</h2>
            {SHAPES[part.type].fields.map((f) => {
              const v = params[part.type][f.key]
              return f.options ? (
                <label key={f.key} className="row">{f.label}
                  <select value={String(v)} onChange={(e) => setParam(f.key, e.target.value)}>
                    {f.options.map(([o, name]) => <option key={o} value={o}>{name}</option>)}
                  </select>
                </label>
              ) : (
                <Num key={f.key} label={f.label} hint={f.hint ?? ''} step={f.step} value={Number(v)} onChange={(n) => setParam(f.key, n)} />
              )
            })}
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
                [elongated ? 'Length' : 'Width', m!.w, false],
                [elongated ? 'Width' : 'Height', m!.h, false],
                ...m!.types.map((t) => [`Hole ø ${HOLES[t].name}`, HOLES[t].d + FIT_OFFSET[fit], false] as const),
                ['Edge web', m!.edgeWeb, issues.some((i) => i.rule === 'edge-web')],
                ['Hole web', m!.holeWeb, issues.some((i) => i.rule === 'hole-web')],
                ...(part.type === 'box' || part.type === 'bracket' ? [['Finger depth', base.thickness, false] as const] : []),
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
