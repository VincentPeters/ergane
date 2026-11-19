'use client'

import { useMemo, useState } from 'react'
import { checkKit, exportKit, partId, sanitizeMachine, type Format, type Machine, type OutFile } from '../src/core/export'
import { MATERIALS, sanitizeMaterial, type Ctx, type GridPart, type Material } from '../src/core/geometry'
import { emptyKit, encodeKit, kitToJSON, parseKit, starterKit, type Kit } from '../src/core/kit'
import { SHEET_PRESETS } from '../src/core/layout'
import { toSVG } from '../src/core/svg'
import { DecimalInput } from './inputs'

type Props = {
  open: boolean; setOpen: (v: boolean) => void
  kit: Kit; setKit: (k: Kit) => void; adoptKit: (k: Kit) => void
  saved: Kit[]; setSaved: (k: Kit[]) => void
  ctx: Ctx; format: Format; machine: Machine
  machines: Machine[]; setMachines: (m: Machine[]) => void; selectMachine: (id: string) => void
  material: Material; userMaterials: Material[]; setUserMaterials: (m: Material[]) => void; selectMaterial: (id: string) => void
  onEdit: (part: GridPart) => void
  deliver: (base: string, files: OutFile[], format: Format) => void
  notice: string; setNotice: (s: string) => void
  describe: (p: GridPart) => string
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kit'

export function KitDrawer(p: Props) {
  const { kit, setKit, ctx, machine } = p
  const key = JSON.stringify([kit.items, kit.sheet, ctx, machine.refSquare])
  // Rules and layout for the whole kit, recomputed only when the kit or the cutting settings change.
  const check = useMemo(() => checkKit(kit, ctx), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const sheets = check.layout.sheets
  const pieces = kit.items.reduce((s, it) => s + it.qty, 0)
  const badLines = new Set([...check.failed.map((f) => f.line), ...check.layout.tooBigLines])
  const preset = SHEET_PRESETS.findIndex(([w, h]) => w === kit.sheet.w && h === kit.sheet.h)
  const [savedIdx, setSavedIdx] = useState(0)

  const setItem = (i: number, qty: number) => {
    const next = { ...kit, items: kit.items.map((it, k) => (k === i ? { ...it, qty: Math.max(1, Math.min(500, Math.round(qty))) } : it)) }
    const ok = parseKit(kitToJSON(next)) // the same limits a reloaded kit must meet
    if (typeof ok === 'string') return p.setNotice(ok)
    setKit(next)
  }
  const exportAll = () => {
    if (!kit.items.length) return p.setNotice('The kit is empty. Add a part first.')
    if (badLines.size) return p.setNotice(`Fix ${[...badLines].map(partId).join(', ')} before exporting the kit.`)
    const { files, sheets: n } = exportKit(kit, ctx, p.format, machine, kitToJSON(kit))
    p.deliver(slug(kit.name), files, p.format)
    p.setNotice(`Exported ${n} sheet${n === 1 ? '' : 's'}, the parts list and the kit file.`)
  }
  const share = async () => {
    const url = `${location.origin}${location.pathname}#kit=${await encodeKit(kit)}`
    try { await navigator.clipboard.writeText(url); p.setNotice('Share link copied. The kit travels in the link itself.') }
    catch { p.setNotice(`Copy this link: ${url}`) }
  }
  const importKit = async (file: File) => {
    const k = parseKit(await file.text())
    if (typeof k === 'string') return p.setNotice(k)
    p.adoptKit(k); p.setNotice(`Loaded “${k.name}”.`)
  }
  const save = () => {
    const rest = p.saved.filter((s) => s.name !== kit.name)
    p.setSaved([...rest, kit]); p.setNotice(`Saved “${kit.name}” in this browser.`)
  }

  return (
    <section className={`drawer${p.open ? ' open' : ''}`} aria-label="Kit">
      <div className="drawer-bar">
        <button className="ghost" aria-expanded={p.open} onClick={() => p.setOpen(!p.open)}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d={p.open ? 'M1 3l4 4 4-4' : 'M1 7l4-4 4 4'} /></svg>
          Kit
        </button>
        <b>{kit.name}</b>
        <span className="meta">
          {kit.items.length} line{kit.items.length === 1 ? '' : 's'} · {pieces} piece{pieces === 1 ? '' : 's'} · {sheets.length} sheet{sheets.length === 1 ? '' : 's'} of {kit.sheet.w} × {kit.sheet.h}
        </span>
        {badLines.size > 0 && <span className="err">{badLines.size} line{badLines.size === 1 ? '' : 's'} blocked</span>}
        <span className="notice" role="status">{p.notice}</span>
        <button className="primary" onClick={exportAll} disabled={!kit.items.length}>Export kit</button>
      </div>

      {p.open && (
        <div className="drawer-body">
          <div className="kit-list">
            {kit.items.length === 0 ? (
              <p className="note-text">No parts yet. Add the part on screen with Add to kit, or load the starter kit.</p>
            ) : (
              <table>
                <thead><tr><th>ID</th><th>Part</th><th>Qty</th><th><span className="sr">Actions</span></th></tr></thead>
                <tbody>
                  {kit.items.map((it, i) => (
                    <tr key={i} className={badLines.has(i) ? 'bad' : ''}
                      title={check.failed.find((f) => f.line === i)?.issues.map((x) => x.message).join('\n') ?? (check.layout.tooBigLines.includes(i) ? 'Too large for the sheet.' : undefined)}>
                      <td>{partId(i)}</td>
                      <td>{p.describe(it.part)}</td>
                      <td><DecimalInput value={it.qty} onCommit={(v) => setItem(i, v)} valid={(v) => v >= 1 && v <= 500} aria-label={`Quantity of ${partId(i)}`} /></td>
                      <td className="acts">
                        <button className="link" onClick={() => p.onEdit(it.part)}>Edit</button>
                        <button className="link" onClick={() => setKit({ ...kit, items: kit.items.filter((_, k) => k !== i) })}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="sheets" aria-label="Sheet layout">
            {sheets.length === 0 && <p className="note-text">The sheet layout appears here.</p>}
            {sheets.map((paths, i) => (
              <figure key={i}>
                {/* Built by toSVG from numbers only, so injecting it is safe. */}
                <div className="sheet" style={{ aspectRatio: `${kit.sheet.w} / ${kit.sheet.h}` }}
                  dangerouslySetInnerHTML={{ __html: toSVG(paths, { sheet: kit.sheet }) }} />
                <figcaption>Sheet {String(i + 1).padStart(2, '0')}</figcaption>
              </figure>
            ))}
          </div>

          <div className="kit-actions">
            <label className="row">Kit name
              <input type="text" className="text" value={kit.name} maxLength={60} onChange={(e) => setKit({ ...kit, name: e.target.value })} />
            </label>
            <label className="row">Sheet
              <select value={preset} onChange={(e) => { const [w, h] = SHEET_PRESETS[Number(e.target.value)]; setKit({ ...kit, sheet: { ...kit.sheet, w, h } }) }}>
                {preset < 0 && <option value={-1}>{kit.sheet.w} × {kit.sheet.h} mm</option>}
                {SHEET_PRESETS.map(([w, h], i) => <option key={i} value={i}>{w} × {h} mm</option>)}
              </select>
            </label>
            <label className="row"><span>Spacing <small>mm</small></span>
              <DecimalInput value={kit.sheet.spacing} valid={(v) => v >= 0 && v <= 20} onCommit={(v) => setKit({ ...kit, sheet: { ...kit.sheet, spacing: v } })} />
            </label>
            <div className="btns">
              <button className="ghost" onClick={() => { p.adoptKit(starterKit()); p.setNotice('Loaded the starter kit.') }}>Starter kit</button>
              <button className="ghost" onClick={() => { setKit(emptyKit()); p.setNotice('Started a new kit.') }}>New</button>
              <button className="ghost" onClick={save}>Save</button>
              <button className="ghost" onClick={share} disabled={!kit.items.length}>Share link</button>
              <label className="ghost file">Import
                <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) importKit(f); e.target.value = '' }} />
              </label>
            </div>
            {p.saved.length > 0 && (
              <div className="row saved">
                <select aria-label="Saved kits" value={Math.min(savedIdx, p.saved.length - 1)} onChange={(e) => setSavedIdx(Number(e.target.value))}>
                  {p.saved.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
                <button className="link" onClick={() => { const s = p.saved[Math.min(savedIdx, p.saved.length - 1)]; p.adoptKit(s); p.setNotice(`Loaded “${s.name}”.`) }}>Load</button>
                <button className="link" onClick={() => { const s = p.saved[Math.min(savedIdx, p.saved.length - 1)]; p.adoptKit({ ...s, name: `${s.name} copy`.slice(0, 60) }); p.setNotice('Duplicated; save to keep the copy.') }}>Duplicate</button>
                <button className="link" onClick={() => { p.setSaved(p.saved.filter((_, i) => i !== Math.min(savedIdx, p.saved.length - 1))); setSavedIdx(0) }}>Delete</button>
              </div>
            )}
            <MaterialEditor material={p.material} user={p.userMaterials} setUser={p.setUserMaterials} select={p.selectMaterial} notice={p.setNotice} />
            <MachineEditor machine={machine} machines={p.machines} setMachines={p.setMachines} select={p.selectMachine} notice={p.setNotice} />
          </div>
        </div>
      )}
    </section>
  )
}

// Machine profiles remap layer colours and choose how files are split (spec 8). The default stays fixed;
// saving under a new name creates a profile, and kerf is calibrated per machine.
function MachineEditor({ machine, machines, setMachines, select, notice }: {
  machine: Machine; machines: Machine[]; setMachines: (m: Machine[]) => void; select: (id: string) => void; notice: (s: string) => void
}) {
  const [draft, setDraft] = useState<Machine>(machine)
  const [forId, setForId] = useState(machine.id)
  if (forId !== machine.id) { setForId(machine.id); setDraft(machine) }
  const set = (patch: Partial<Machine>) => setDraft({ ...draft, ...patch })
  const saveAs = () => {
    const name = draft.name.trim() || 'My laser'
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'laser'
    const id = machine.id === 'default' || draft.name !== machine.name ? `${base}-${Date.now().toString(36).slice(-4)}` : machine.id
    const clean = sanitizeMachine({ ...draft, id, name })
    if (!clean) return notice('That machine profile could not be saved.')
    setMachines([...machines.filter((m) => m.id !== id), clean]); select(id)
    notice(`Saved machine “${clean.name}”. Calibrate kerf for it with the coupon.`)
  }
  return (
    <fieldset className="machine">
      <legend className="it">Machine</legend>
      <label className="row">Name <input type="text" className="text" value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} /></label>
      <div className="row colors">
        {(['engrave', 'inner', 'outer'] as const).map((op) => (
          <label key={op}>{{ engrave: 'Engrave', inner: 'Inner', outer: 'Outer' }[op]}
            <input type="color" value={draft.colors[op]} onChange={(e) => set({ colors: { ...draft.colors, [op]: e.target.value.toUpperCase() } })} />
          </label>
        ))}
      </div>
      <label className="row">Files
        <select value={draft.split} onChange={(e) => set({ split: e.target.value as Machine['split'] })}>
          <option value="layers">One file, a layer per operation</option>
          <option value="per-op">One file per operation</option>
          <option value="single">One colour, order by hand</option>
        </select>
      </label>
      <label className="row check">10 mm reference square
        <input type="checkbox" checked={draft.refSquare} onChange={(e) => set({ refSquare: e.target.checked })} />
      </label>
      <div className="btns">
        <button className="ghost" onClick={saveAs}>{machine.id === 'default' ? 'Save as new machine' : 'Save machine'}</button>
        {machine.id !== 'default' && (
          <button className="link" onClick={() => { setMachines(machines.filter((m) => m.id !== machine.id)); select('default') }}>Delete</button>
        )}
      </div>
    </fieldset>
  )
}

// User material presets (spec 4): thickness, starting kerf and minimum web. Built-ins stay fixed;
// saving under a new name adds a preset, which kits carry with them.
function MaterialEditor({ material, user, setUser, select, notice }: {
  material: Material; user: Material[]; setUser: (m: Material[]) => void; select: (id: string) => void; notice: (s: string) => void
}) {
  const [draft, setDraft] = useState<Material>(material)
  const [forId, setForId] = useState(material.id)
  if (forId !== material.id) { setForId(material.id); setDraft(material) }
  const builtIn = MATERIALS.some((m) => m.id === material.id)
  const saveAs = () => {
    const name = draft.name.trim() || 'My material'
    const slugged = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'material'
    const id = builtIn || name !== material.name ? `${slugged}-${Date.now().toString(36).slice(-4)}` : material.id
    const clean = sanitizeMaterial({ ...draft, id, name })
    setUser([...user.filter((m) => m.id !== id), clean]); select(id)
    notice(`Saved material “${clean.name}”. Calibrate its kerf with the coupon.`)
  }
  return (
    <fieldset className="machine">
      <legend className="it">Material</legend>
      <label className="row">Name <input type="text" className="text" value={draft.name} maxLength={40} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      {(['thickness', 'kerf', 'minWeb'] as const).map((k) => (
        <label key={k} className="row"><span>{{ thickness: 'Thickness', kerf: 'Starting kerf', minWeb: 'Min web' }[k]} <small>mm</small></span>
          <DecimalInput value={draft[k]} onCommit={(v) => setDraft({ ...draft, [k]: v })} valid={(v) => v >= 0 && v <= 25} />
        </label>
      ))}
      <div className="btns">
        <button className="ghost" onClick={saveAs}>{builtIn ? 'Save as new material' : 'Save material'}</button>
        {!builtIn && <button className="link" onClick={() => { setUser(user.filter((m) => m.id !== material.id)); select(MATERIALS[0].id) }}>Delete</button>}
      </div>
    </fieldset>
  )
}
