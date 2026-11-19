'use client'

import { useEffect, useState } from 'react'

// Numbers always read with a decimal point, whatever the browser locale ("3.2", never "3,2"); a number
// input would follow the locale. Accepts either separator, commits valid values as they are typed,
// and settles to the formatted value on blur.
export function DecimalInput({ value, onCommit, format = (v) => String(+v.toFixed(4)), valid = () => true, ...rest }: {
  value: number; onCommit: (v: number) => void; format?: (v: number) => string; valid?: (v: number) => boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const shown = Number.isFinite(value) ? format(value) : ''
  const [draft, setDraft] = useState(shown)
  const parse = (s: string) => Number(s.trim().replace(',', '.'))
  // Follow outside changes (material switch, coupon result) without fighting a half-typed "0." draft.
  useEffect(() => { if (parse(draft) !== value) setDraft(shown) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input {...rest} type="text" inputMode="decimal" className="num" value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const v = parse(e.target.value)
        if (e.target.value.trim() && Number.isFinite(v) && valid(v)) onCommit(v)
      }}
      onBlur={() => setDraft(shown)} />
  )
}

export function Num(props: { label: string; hint: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="row">
      <span>{props.label} <small>{props.hint}</small></span>
      <DecimalInput value={props.value} onCommit={props.onChange} />
    </label>
  )
}

