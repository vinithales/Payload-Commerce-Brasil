'use client'

import { Minus, Plus } from 'lucide-react'
import { useState } from 'react'

type Props = {
  value: number
  onChange: (value: number) => void
  max: number
  disabled?: boolean
}

export function QuantityInput({ value, onChange, max, disabled = false }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const unavailable = disabled || max < 1
  const buttonClassName =
    'flex size-11 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30'

  const commit = () => {
    const parsed = Number(draft ?? value)
    onChange(Math.max(1, Math.min(max, Number.isFinite(parsed) ? Math.trunc(parsed) : value)))
    setDraft(null)
  }

  return (
    <div className="inline-flex h-12 items-center gap-1 rounded-full border border-border bg-background p-0.5 shadow-xs transition-colors focus-within:border-ring">
      <button
        aria-label="Decrease quantity"
        className={buttonClassName}
        disabled={unavailable || value <= 1}
        onClick={() => {
          setDraft(null)
          onChange(value - 1)
        }}
        type="button"
      >
        <Minus aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
      <input
        aria-label="Quantity"
        className="h-10 w-10 appearance-none rounded-md bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
        disabled={unavailable}
        inputMode="numeric"
        max={Math.max(1, max)}
        min={1}
        onBlur={commit}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const parsed = Number(next)
          if (next !== '' && Number.isInteger(parsed) && parsed >= 1 && parsed <= max) {
            onChange(parsed)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
        step={1}
        type="number"
        value={draft ?? value}
      />
      <button
        aria-label="Increase quantity"
        className={buttonClassName}
        disabled={unavailable || value >= max}
        onClick={() => {
          setDraft(null)
          onChange(value + 1)
        }}
        type="button"
      >
        <Plus aria-hidden="true" size={16} strokeWidth={1.75} />
      </button>
    </div>
  )
}
