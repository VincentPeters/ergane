// Browser storage for per-viewer state: calibrated kerf, machines, kits, imported components.
// Every read is re-checked (storage is user-editable) and every access may throw in private modes.
import { sanitizeComponent, type ComponentDef } from '../src/core/components'
import { DEFAULT_MACHINE, sanitizeMachine, type Machine } from '../src/core/export'
import { sanitizeMaterial, sanitizeProfile, type Material, type Profile } from '../src/core/geometry'
import { kitToJSON, parseKit, type Kit } from '../src/core/kit'

function read<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v === null ? fallback : (JSON.parse(v) as T) } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* kept for this visit only */ }
}

// Kerf belongs to a machine and material pair (spec 7). Values saved before machines existed move to the default machine.
const KERF = 'cutgrid.kerf.v2', KERF_V1 = 'cutgrid.kerf.v1'
export const kerfKey = (machine: string, material: string) => `${machine}:${material}`
export function loadKerfs(): Record<string, number> {
  const v2 = read<Record<string, unknown> | null>(KERF, null)
  const src = v2 ?? Object.fromEntries(Object.entries(read<Record<string, unknown>>(KERF_V1, {})).map(([m, k]) => [kerfKey('default', m), k]))
  return Object.fromEntries(Object.entries(src).filter(([, k]) => typeof k === 'number' && k >= 0 && k <= 1)) as Record<string, number>
}
export const saveKerfs = (k: Record<string, number>) => write(KERF, k)

const MACHINES = 'cutgrid.machines.v1'
export function loadMachines(): Machine[] {
  const saved = read<unknown[]>(MACHINES, [])
  return [DEFAULT_MACHINE, ...(Array.isArray(saved) ? saved.flatMap((m) => { const s = sanitizeMachine(m); return s && s.id !== 'default' ? [s] : [] }) : [])]
}
export const saveMachines = (list: Machine[]) => write(MACHINES, list.filter((m) => m.id !== 'default'))

// Kits are stored as their spec-12 JSON and parsed back through the core on load.
const KIT = 'cutgrid.kit.v1', KITS = 'cutgrid.kits.v1'
const parse = (json: unknown) => { const k = typeof json === 'string' ? parseKit(json) : null; return k && typeof k !== 'string' ? k : null }
export const loadKit = (): Kit | null => parse(read<string | null>(KIT, null))
export const saveKit = (kit: Kit) => write(KIT, kitToJSON(kit))
export const loadKits = (): Kit[] => read<unknown[]>(KITS, []).flatMap((j) => { const k = parse(j); return k ? [k] : [] })
export const saveKits = (kits: Kit[]) => write(KITS, kits.map(kitToJSON))

const COMPONENTS_KEY = 'cutgrid.components.v1'
export function loadComponents(): ComponentDef[] {
  const raw = read<unknown[]>(COMPONENTS_KEY, [])
  return Array.isArray(raw) ? raw.flatMap((c) => { const s = sanitizeComponent(c); return typeof s === 'string' ? [] : [s] }) : []
}
export const saveComponents = (list: ComponentDef[]) => write(COMPONENTS_KEY, list)

/** Triggers a browser download. */
export function download(name: string, data: string | Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// The CUSTOM grid profile and user material presets (spec 3 and 4), re-checked through the core on load.
const PROFILE = 'cutgrid.profile.v1', MATERIALS_KEY = 'cutgrid.materials.v1'
export const loadCustomProfile = (): Profile => sanitizeProfile({ id: 'CUSTOM', ...read<Record<string, unknown>>(PROFILE, {}) })
export const saveCustomProfile = (p: Profile) => write(PROFILE, { pitch: p.pitch, custom: p.custom })
export const loadMaterials = (): Material[] =>
  read<unknown[]>(MATERIALS_KEY, []).flatMap((m) => { const s = sanitizeMaterial(m); return s.id === (m as { id?: unknown })?.id ? [s] : [] })
export const saveMaterials = (list: Material[]) => write(MATERIALS_KEY, list)

// Press fit for tab slots, calibrated with the coupon's slot row, per machine and material like kerf.
const PRESS = 'cutgrid.pressfit.v1'
export const loadPressFits = (): Record<string, number> =>
  Object.fromEntries(Object.entries(read<Record<string, unknown>>(PRESS, {})).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 1)) as Record<string, number>
export const savePressFits = (p: Record<string, number>) => write(PRESS, p)
