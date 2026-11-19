'use client'

import { useMemo, useState } from 'react'
import { MATERIALS, PROFILES, bbox, generate, validate, type Fit, type Part, type Pattern } from '../src/core/geometry'
import { toSVG } from '../src/core/svg'

// Inputs hold raw text-ish numbers; clamp only when building the part so typing "15" is not fought.
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v) || min))

function Num(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label>
      {props.label}
      <input type="number" value={props.value} min={props.min} max={props.max} step={props.step ?? 1}
        onChange={(e) => props.onChange(e.target.valueAsNumber)} />
    </label>
  )
}

export default function Page() {
  const [type, setType] = useState<Part['type']>('strip')
  const [strip, setStrip] = useState({ holes: 11, rows: 1 })
  const [plate, setPlate] = useState({ cols: 5, rows: 5, pattern: 'full' as Pattern, radius: 2 })
  const [materialId, setMaterialId] = useState(MATERIALS[0].id)
  const [kerf, setKerf] = useState(MATERIALS[0].kerf)
  const [fit, setFit] = useState<Fit>('normal')
  const [zoom, setZoom] = useState(2)

  const part: Part = type === 'strip'
    ? { type, holes: clamp(strip.holes, 2, 50), rows: clamp(strip.rows, 1, 3) }
    : { type, cols: clamp(plate.cols, 2, 50), rows: clamp(plate.rows, 2, 50), pattern: plate.pattern, radius: Math.max(0, plate.radius || 0) }

  const base = MATERIALS.find((m) => m.id === materialId)!
  const ctx = { profile: PROFILES[0], material: { ...base, kerf: Math.max(0, kerf || 0) }, fit }
  const paths = useMemo(() => generate(part, ctx), [JSON.stringify(part), JSON.stringify(ctx)])
  const svg = useMemo(() => toSVG(paths), [paths])
  const issues = validate(part, ctx)
  const size = bbox(paths)
  const holeCount = paths.filter((p) => p.op === 'inner').length
  const name = type === 'strip' ? `strip-${part.type === 'strip' && part.holes}` : `plate-${plate.cols}x${plate.rows}`

  const download = () => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    Object.assign(document.createElement('a'), { href: url, download: `${name}.svg` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Cutgrid</h1>
        <label>Grid
          <select value={PROFILES[0].id} disabled><option>{PROFILES[0].id}</option></select>
        </label>
        <label>Material
          <select value={materialId} onChange={(e) => {
            setMaterialId(e.target.value)
            setKerf(MATERIALS.find((m) => m.id === e.target.value)!.kerf)
          }}>
            {MATERIALS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <Num label="Kerf (mm)" value={kerf} min={0} max={1} step={0.01} onChange={setKerf} />
        <label>Fit
          <select value={fit} onChange={(e) => setFit(e.target.value as Fit)}>
            <option value="loose">Loose</option><option value="normal">Normal</option><option value="tight">Tight</option>
          </select>
        </label>
        <button className="primary" onClick={download} disabled={issues.length > 0}>Export SVG</button>
      </header>

      <div className="cols">
        <nav className="library">
          {(['strip', 'plate'] as const).map((t) => (
            <button key={t} aria-pressed={type === t} onClick={() => setType(t)}>{t === 'strip' ? 'Strip' : 'Plate'}</button>
          ))}
        </nav>

        <main className="stage">
          <div className="meta">
            {size.w.toFixed(2)} × {size.h.toFixed(2)} mm · {holeCount} holes ·{' '}
            <label style={{ display: 'inline-flex', flexDirection: 'row', alignItems: 'center' }}>
              zoom <input type="range" min={1} max={8} step={0.5} value={zoom} onChange={(e) => setZoom(+e.target.value)} /> {zoom}×
            </label>
          </div>
          {/* SVG is built by toSVG from numbers only, so injecting it is safe. Base scale is true size. */}
          <div className="preview" style={{ transform: `scale(${zoom})` }} dangerouslySetInnerHTML={{ __html: svg }} />
        </main>

        <aside className="form">
          {type === 'strip' ? (
            <>
              <Num label="Holes (2–50)" value={strip.holes} min={2} max={50} onChange={(holes) => setStrip({ ...strip, holes })} />
              <Num label="Rows (1–3)" value={strip.rows} min={1} max={3} onChange={(rows) => setStrip({ ...strip, rows })} />
            </>
          ) : (
            <>
              <Num label="Columns" value={plate.cols} min={2} max={50} onChange={(cols) => setPlate({ ...plate, cols })} />
              <Num label="Rows" value={plate.rows} min={2} max={50} onChange={(rows) => setPlate({ ...plate, rows })} />
              <Num label="Corner radius (mm)" value={plate.radius} min={0} max={20} step={0.5} onChange={(radius) => setPlate({ ...plate, radius })} />
              <label>Hole pattern
                <select value={plate.pattern} onChange={(e) => setPlate({ ...plate, pattern: e.target.value as Pattern })}>
                  <option value="full">Full</option><option value="border">Border</option><option value="checker">Checker</option>
                </select>
              </label>
            </>
          )}
          {issues.length > 0 && (
            <ul className="issues" role="alert">
              {issues.map((i) => <li key={i.rule}><b>{i.rule}</b>: {i.message}</li>)}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}
