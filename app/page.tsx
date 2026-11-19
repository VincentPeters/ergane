'use client'

import { useEffect, useMemo, useState } from 'react'
import { COMPONENTS, parseComponents, type ComponentDef } from '../src/core/components'
import { DEFAULT_MACHINE, exportPart, type Format, type Machine, type OutFile } from '../src/core/export'
import { decodeKit, emptyKit, kitToJSON, parseKit, type Kit } from '../src/core/kit'
import { zip } from '../src/core/zip'
import { DecimalInput, Num } from './inputs'
import { KitDrawer } from './KitDrawer'
import {
  download, kerfKey, loadComponents, loadCustomProfile, loadKerfs, loadPressFits, savePressFits, loadKit, loadKits, loadMachines, loadMaterials,
  saveComponents, saveCustomProfile, saveKerfs, saveKit, saveKits, saveMachines, saveMaterials,
} from './storage'
import {
  ANGLES, FIT_OFFSET, HOLES, MATERIALS, PRESS_FIT, PROFILES, RULE_COUNT, bbox, clampPart, couponKerfs, couponPressFits, defaultMix, generate, measure, minWebFor, validate,
  holeSpec, sanitizeProfile, type Ctx, type Fit, type GridPart, type HoleMix, type Material, type Part, type Profile,
} from '../src/core/geometry'
import { Chart, OwlMark, type Fault } from './Chart'

type Kind = Part['type']
type ShapeKind = Exclude<Kind, 'coupon'>
type Value = number | string
type Field = { key: string; label: string; hint?: string; step?: number; options?: [Value, string][] }
const BORE: Field = { key: 'bore', label: 'Centre', options: [['hole', 'Bolt hole'], ['axle', 'Technic axle']] }

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
  nutjoint: { name: 'Captive nut joint', group: 'Joints', defaults: { cols: 5, rows: 2, bolt: 12 }, fields: [
    { key: 'cols', label: 'Width', hint: 'holes, odd' }, { key: 'rows', label: 'Rows', hint: 'holes' },
    { key: 'bolt', label: 'Bolt length', hint: 'mm' }] },
  spacer: { name: 'Spacers', group: 'Joints', defaults: { outer: 8, quantity: 6 }, fields: [
    { key: 'outer', label: 'Outer diameter', hint: 'mm', step: 0.5 }, { key: 'quantity', label: 'Quantity', hint: '1–48' }] },
  // The component itself is chosen in a custom block above these fields; see MountFields.
  mount: { name: 'Mounting plate', group: 'Mounting', defaults: { component: COMPONENTS[0].id, border: 1, w: '', h: '', d: '' }, fields: [
    { key: 'border', label: 'Border', hint: 'rings of holes' }] },
  adapter: { name: 'Adapter 8 / 12.7', group: 'Mounting', defaults: { cols8: 4, cols127: 3, rows: 4 }, fields: [
    { key: 'cols8', label: '8 mm columns', hint: 'holes' }, { key: 'cols127', label: '12.7 mm columns', hint: 'holes' },
    { key: 'rows', label: 'Rows', hint: '8 mm holes' }] },
  gear: { name: 'Spur gear', group: 'Motion', defaults: { teeth: 20, module: 2, bore: 'hole' }, fields: [
    { key: 'teeth', label: 'Teeth', hint: '8–120' }, { key: 'module', label: 'Module', hint: 'mm' }, BORE] },
  rack: { name: 'Rack', group: 'Motion', defaults: { holes: 11, module: 2 }, fields: [
    { key: 'holes', label: 'Holes', hint: '3–50' }, { key: 'module', label: 'Module', hint: 'mm, as the gear' }] },
  wheel: { name: 'Wheel', group: 'Motion', defaults: { diameter: 60, groove: 2.5, bore: 'hole' }, fields: [
    { key: 'diameter', label: 'Diameter', hint: 'mm' }, { key: 'groove', label: 'Tyre groove', hint: 'mm deep' }, BORE] },
  pulley: { name: 'GT2 pulley', group: 'Motion', defaults: { teeth: 20, bore: 'hole' }, fields: [
    { key: 'teeth', label: 'Teeth', hint: '12–80' }, BORE] },
}
const GROUPS = ['Structural', 'Round', 'Connectors', 'Joints', 'Mounting', 'Motion']
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
    case 'nutjoint': return [`Captive nut joint, ${p.bolt} mm bolt`, `nutjoint-${p.cols}-${p.bolt}`]
    case 'mount': return [`Mounting plate, ${p.component.name}`, `mount-${p.component.id}`]
    case 'adapter': return ['Adapter plate, 8 / 12.7 mm', `adapter-${p.cols8}-${p.cols127}-${p.rows}`]
    case 'gear': return [`Spur gear, ${p.teeth} teeth, module ${+p.module.toFixed(2)}`, `gear-z${p.teeth}-m${+p.module.toFixed(2)}`]
    case 'rack': return [`Rack, ${p.holes} holes, module ${+p.module.toFixed(2)}`, `rack-${p.holes}-m${+p.module.toFixed(2)}`]
    case 'wheel': return [`Wheel ø ${+p.diameter.toFixed(1)} mm`, `wheel-${Math.round(p.diameter)}`]
    case 'pulley': return [`GT2 pulley, ${p.teeth} teeth`, `pulley-gt2-${p.teeth}`]
  }
}

// The editor's form values for a part, so a kit line can be opened for editing.
function partToParams(part: GridPart): [ShapeKind, Record<string, Value>] {
  if (part.type === 'mount') {
    const r = part.component.rect
    return ['mount', { component: part.component.id, border: part.border, w: r?.w ?? '', h: r?.h ?? '', d: r?.d ?? '' }]
  }
  const { type, label: _label, ...rest } = part as GridPart & { label?: boolean }
  return [type as ShapeKind, rest as Record<string, Value>]
}

// A parametric component takes the typed width, height and hole size over its defaults.
function resolveComponent(lib: ComponentDef[], v: Record<string, Value>): ComponentDef {
  const def = lib.find((c) => c.id === v.component) ?? COMPONENTS[0]
  if (!def.parametric || !def.rect) return def
  const pick = (k: 'w' | 'h' | 'd') => (v[k] === '' || !Number.isFinite(Number(v[k])) ? def.rect![k] : Number(v[k]))
  return { ...def, rect: { w: pick('w'), h: pick('h'), d: pick('d') } }
}
const MIXES: { id: HoleMix; name: string }[] = [
  { id: 'all-m3', name: 'All M3' },
  { id: 'all-technic', name: 'All Technic' },
  { id: 'alternating', name: 'Alternating' },
  { id: 'border-technic', name: 'Technic border, M3 inside' },
]

const FORMATS: [Format, string][] = [['svg', 'SVG'], ['dxf', 'DXF'], ['pdf', 'PDF']]
const MIME: Record<Format, string> = { svg: 'image/svg+xml', dxf: 'application/dxf', pdf: 'application/pdf' }

/** One file downloads as itself; several (per-operation splits, a kit) arrive as one ZIP. */
function deliver(base: string, files: OutFile[], format: Format) {
  if (files.length === 1) download(files[0].name, files[0].data, files[0].name.endsWith('.csv') ? 'text/csv' : MIME[format])
  else download(`${base}.zip`, zip(files), 'application/zip')
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
  const [bestFit, setBestFit] = useState<number | null>(null)
  const [pressFits, setPressFits] = useState<Record<string, number>>({})

  const [custom, setCustom] = useState<ComponentDef[]>([])
  const [importMsg, setImportMsg] = useState('')
  const [machines, setMachines] = useState<Machine[]>([DEFAULT_MACHINE])
  const [machineId, setMachineId] = useState(DEFAULT_MACHINE.id)
  const [format, setFormat] = useState<Format>('svg')
  const [kit, setKitState] = useState<Kit>(() => emptyKit())
  const [savedKits, setSavedKits] = useState<Kit[]>([])
  const [drawer, setDrawer] = useState(false)
  const [notice, setNotice] = useState('')

  const [customProfile, setCustomProfileState] = useState<Profile>(() => PROFILES.find((p) => p.id === 'CUSTOM')!)
  const [userMaterials, setUserMaterialsState] = useState<Material[]>([])
  const setCustomProfile = (p: Profile) => { const s = sanitizeProfile(p); setCustomProfileState(s); saveCustomProfile(s) }
  const setUserMaterials = (list: Material[]) => { setUserMaterialsState(list); saveMaterials(list) }
  const materials = [...MATERIALS, ...userMaterials.filter((u) => !MATERIALS.some((m) => m.id === u.id))]
  const profile = profileId === 'CUSTOM' ? customProfile : PROFILES.find((p) => p.id === profileId) ?? PROFILES[0]
  const base = materials.find((m) => m.id === materialId) ?? MATERIALS[0]

  const setKit = (k: Kit) => { setKitState(k); saveKit(k) }
  // The kit follows the settings in the top bar; loading a kit sets the top bar to the kit's settings,
  // adding its custom grid or material here when this browser has not seen them.
  const adoptKit = (k: Kit) => {
    if (k.profile.id === 'CUSTOM') setCustomProfile(k.profile)
    if (!materials.some((m) => m.id === k.material.id)) setUserMaterials([...userMaterials, k.material])
    setProfileId(k.profile.id); setMix(k.holeMix); setMaterialId(k.material.id); setFit(k.fit)
    setKit(k)
  }
  useEffect(() => {
    setKerfs(loadKerfs()); setPressFits(loadPressFits()); setCustom(loadComponents()); setMachines(loadMachines()); setSavedKits(loadKits())
    setCustomProfileState(loadCustomProfile()); setUserMaterialsState(loadMaterials())
    const stored = loadKit()
    if (stored) adoptKit(stored)
    // A share link carries the kit in the URL fragment, which never reaches a server.
    if (location.hash.startsWith('#kit=')) {
      decodeKit(location.hash.slice(5)).then((k) => {
        if (typeof k === 'string') return setNotice(k)
        adoptKit(k); setDrawer(true); setNotice(`Loaded “${k.name}” from the link.`)
        history.replaceState(null, '', location.pathname)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const settings = JSON.stringify([profile, mix, base, fit])
  useEffect(() => {
    if (JSON.stringify([kit.profile, kit.holeMix, kit.material, kit.fit]) !== settings)
      setKit({ ...kit, profile, holeMix: mix, material: base, fit })
  }, [settings]) // eslint-disable-line react-hooks/exhaustive-deps
  const machine = machines.find((x) => x.id === machineId) ?? DEFAULT_MACHINE
  const library = [...COMPONENTS, ...custom.filter((c) => !COMPONENTS.some((b) => b.id === c.id))]
  const importComponents = async (file: File) => {
    const parsed = parseComponents(await file.text())
    if (typeof parsed === 'string') return setImportMsg(parsed)
    const next = [...custom.filter((c) => !parsed.some((p) => p.id === c.id)), ...parsed]
    setCustom(next)
    saveComponents(next)
    setImportMsg(`Added ${parsed.length} component${parsed.length === 1 ? '' : 's'}.`)
  }

  const kk = kerfKey(machine.id, materialId)
  const calibrated = kk in kerfs
  const kerf = kerfs[kk] ?? base.kerf
  const setKerf = (v: number) => {
    if (!Number.isFinite(v) || v < 0 || v > 1) return
    const next = { ...kerfs, [kk]: v }
    setKerfs(next)
    saveKerfs(next)
  }

  const part: Part = kind === 'coupon' ? { type: 'coupon' }
    : kind === 'mount' ? clampPart({ type: 'mount', component: resolveComponent(library, params.mount), border: Number(params.mount.border), label })
    : clampPart({ type: kind, ...params[kind], label } as Part)
  const setParam = (key: string, v: Value) => kind !== 'coupon' && setParams({ ...params, [kind]: { ...params[kind], [key]: v } })
  const pressFit = pressFits[kk] ?? PRESS_FIT
  const setPressFit = (v: number) => { const next = { ...pressFits, [kk]: v }; setPressFits(next); savePressFits(next) }
  const ctx: Ctx = { profile, material: { ...base, kerf }, fit, holeMix: mix, sheet: kit.sheet, pressFit }

  const key = JSON.stringify([part, ctx])
  const paths = useMemo(() => generate(part, ctx), [key])
  const issues = validate(part, ctx)
  const m = part.type === 'coupon' ? null : measure(part, ctx)
  // Failing webs are drawn on the plot where they occur, not only listed in the column.
  const faults: Fault[] = !m ? [] : issues.flatMap((i) => {
    const span = i.rule === 'hole-web' ? m.holeSpan : m.edgeSpan
    const web = i.rule === 'hole-web' ? m.holeWeb : m.edgeWeb
    return span ? [{ span, label: `${web.toFixed(2)} < ${minWebFor(part, ctx)}`, edge: i.rule === 'edge-web' }] : []
  })
  const outer = bbox(paths.filter((p) => p.op === 'outer'))
  const nominal = m ?? { w: outer.w - kerf, h: outer.h - kerf }
  const holeCount = paths.filter((p) => p.shape.kind === 'circle').length
  const [title, file] = part.type === 'coupon' ? ['Calibration coupon', `coupon-${materialId}`] : describe(part, holeCount, profile.pitch)
  const elongated = part.type === 'strip' || part.type === 'slotted' || part.type === 'rack'

  const exportCurrent = () => deliver(file, exportPart(file, paths, format, machine), format)
  const editLine = (part: GridPart) => {
    const [k, v] = partToParams(part)
    setParams({ ...params, [k]: { ...params[k], ...v } })
    setLabel(part.label !== false)
    setKind(k)
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
            {materials.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
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
        <label className="f">Machine
          <select value={machine.id} onChange={(e) => { setMachineId(e.target.value); setBest(null) }}>
            {machines.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <span className="sp" />
        <button className="link" onClick={() => setKind('coupon')}>Calibrate</button>
        <div className="export">
          <select aria-label="File format" value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            {FORMATS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button className="primary" onClick={exportCurrent} disabled={issues.length > 0}
            title={issues.length ? 'Fix the failed rules first' : `Download ${file}.${format}`}>Export</button>
        </div>
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
        <p className="soon">Every part bolts to every other on the same grid.</p>
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
            rows={profile.mixable ? 'M3 and Technic rows' : `${holeSpec(profile, profile.hole).name} row`}
            onUse={(k) => { setKerf(k); setBest(null) }}
            pressFit={pressFit} bestFit={bestFit} setBestFit={setBestFit} onUseFit={(v) => { setPressFit(v); setBestFit(null) }} />
        ) : (
          <>
            {profile.id === 'CUSTOM' && (
              <>
                <h2 className="it">Custom grid</h2>
                <Num label="Pitch" hint="mm" value={profile.pitch} onChange={(v) => setCustomProfile({ ...profile, pitch: v })} />
                <Num label="Hole ø" hint="mm" value={profile.custom!.d} onChange={(v) => setCustomProfile({ ...profile, custom: { ...profile.custom!, d: v } })} />
                <Num label="Strip width" hint="mm" value={profile.custom!.width} onChange={(v) => setCustomProfile({ ...profile, custom: { ...profile.custom!, width: v } })} />
              </>
            )}
            <h2 className="it">Parameters</h2>
            {part.type === 'mount' && (
              <>
                <label className="row">Component
                  <select value={part.component.id} onChange={(e) => setParam('component', e.target.value)}>
                    {library.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                {part.component.parametric && part.component.rect && (['w', 'h', 'd'] as const).map((k) => (
                  <Num key={k} label={{ w: 'Hole spacing x', h: 'Hole spacing y', d: 'Hole ø' }[k]} hint="mm" step={0.1}
                    value={part.component.rect![k]} onChange={(n) => setParam(k, n)} />
                ))}
                <p className="note-text">
                  {part.component.fastener && `Fasteners: ${part.component.fastener}. `}
                  {part.component.verify ? 'Check this pattern against your part’s datasheet before cutting.' : 'Pattern from the maker’s drawing.'}
                </p>
                <label className="link file">Import components (JSON)
                  <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importComponents(f); e.target.value = '' }} />
                </label>
                {importMsg && <p className="note-text" role="status">{importMsg}</p>}
              </>
            )}
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
                ...m!.types.map((t) => [`Hole ø ${holeSpec(profile, t).name}`, holeSpec(profile, t).d + FIT_OFFSET[fit], false] as const),
                ...m!.own.map((d) => [`Hole ø ${d.toFixed(2)} part`, d + FIT_OFFSET[fit], false] as const),
                ...(m!.axle ? [['Axle cross', 4.8 + FIT_OFFSET[fit], false] as const] : []),
                ['Edge web', m!.edgeWeb, issues.some((i) => i.rule === 'edge-web')],
                ['Hole web', m!.holeWeb, issues.some((i) => i.rule === 'hole-web')],
                ...(part.type === 'box' || part.type === 'bracket' || part.type === 'nutjoint' ? [['Finger depth', base.thickness, false] as const] : []),
                ...(part.type === 'nutjoint' ? [['Press fit', pressFit, false] as const] : []),
                [`Min web, ${minWebFor(part, ctx) < base.minWeb ? 'this part' : base.name}`, minWebFor(part, ctx), false],
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
            <button className="ghost wide" onClick={() => {
              const next = { ...kit, items: [...kit.items, { part: part as GridPart, qty: 1 }] }
              const ok = parseKit(kitToJSON(next)) // the same limits a reloaded kit must meet
              if (typeof ok === 'string') return setNotice(ok)
              setKit(next)
              setNotice(`Added ${title} to ${kit.name}.`)
            }}>Add to kit</button>
          </>
        )}
      </aside>

      <KitDrawer open={drawer} setOpen={setDrawer} kit={kit} setKit={setKit} adoptKit={adoptKit}
        saved={savedKits} setSaved={(k) => { setSavedKits(k); saveKits(k) }}
        ctx={ctx} format={format} machine={machine}
        machines={machines} setMachines={(list) => { setMachines(list); saveMachines(list) }} selectMachine={setMachineId}
        material={base} userMaterials={userMaterials} setUserMaterials={setUserMaterials} selectMaterial={setMaterialId}
        onEdit={editLine} deliver={deliver} notice={notice} setNotice={setNotice}
        describe={(p) => describe(p, generate(p, ctx).filter((x) => x.shape.kind === 'circle').length, profile.pitch)[0]} />
    </div>
  )
}

// Kerf is the most consequential number on screen, so it always reads "0.20": a number input would
// follow the browser locale ("0,2"). Accepts either separator; settles to two decimals on blur.
function KerfInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  return <DecimalInput value={value} onCommit={onCommit} format={(v) => v.toFixed(2)} valid={(v) => v >= 0 && v <= 1}
    aria-describedby="kerf-src" aria-label="Kerf in millimetres" />
}

function Coupon(props: {
  kerf: number; best: number | null; setBest: (k: number) => void; onUse: (k: number) => void; material: string; rows: string
  pressFit: number; bestFit: number | null; setBestFit: (v: number) => void; onUseFit: (v: number) => void
}) {
  const options = couponKerfs(props.kerf)
  const fits = couponPressFits(props.pressFit)
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

      <h2 className="it">Press fit for tab slots</h2>
      <p className="note-text">Push an offcut of the same sheet into each slot of the FIT row. Pick the label of the slot it enters snugly by hand.</p>
      <div className="labels five" role="radiogroup" aria-label="Best-fitting slot label">
        {fits.map((v) => (
          <button key={v} role="radio" aria-checked={props.bestFit === v} onClick={() => props.setBestFit(v)}>{v.toFixed(2)}</button>
        ))}
      </div>
      <button className="ghost wide" disabled={props.bestFit === null} onClick={() => props.bestFit !== null && props.onUseFit(props.bestFit)}>
        {props.bestFit === null ? 'Pick a slot label first' : `Use ${props.bestFit.toFixed(2)} mm as press fit`}
      </button>
      <p className="note-text">Current press fit {props.pressFit.toFixed(2)} mm, used by tab slots in joints.</p>
    </>
  )
}
