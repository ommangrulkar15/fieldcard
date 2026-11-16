import { useState } from 'react'
import { Button } from '../../components/ui'
import { applyBrand, saveBrand, clearBrand, loadBrand, deriveBrand, BRAND_PRESETS, DEFAULT_BRAND } from '../../lib/brand'

/** Workspace-level brand colour. Admin-only. Themes the accent/primary across
 *  the app; status colours stay fixed, and the colour is clamped so white text
 *  on a primary button always stays readable. */
export default function BrandTab({ workspaceId }: { workspaceId: string }) {
  const [hex, setHex] = useState(() => loadBrand(workspaceId) ?? DEFAULT_BRAND)
  const isDefault = hex.toLowerCase() === DEFAULT_BRAND

  const set = (value: string) => {
    if (!deriveBrand(value)) return
    setHex(value)
    applyBrand(value)
    saveBrand(workspaceId, value.toLowerCase() === DEFAULT_BRAND ? null : value)
  }
  const reset = () => {
    setHex(DEFAULT_BRAND)
    clearBrand()
    saveBrand(workspaceId, null)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-ink">Brand colour</h2>
      <p className="mt-1 text-sm text-muted">
        Set the accent colour for your workspace. It themes buttons, links and highlights everywhere in Fieldcard.
      </p>

      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-ink">Presets</legend>
        <div className="flex flex-wrap gap-2">
          {BRAND_PRESETS.map((p) => {
            const on = hex.toLowerCase() === p.hex.toLowerCase()
            return (
              <button
                key={p.hex}
                type="button"
                aria-pressed={on}
                aria-label={p.name}
                title={p.name}
                onClick={() => set(p.hex)}
                className={`size-9 rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110 ${
                  on ? 'ring-2 ring-ink' : 'ring-1 ring-black/10'
                }`}
                style={{ background: p.hex }}
              />
            )
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="brand-hex" className="mb-1.5 block text-sm font-medium text-ink">
            Custom colour
          </label>
          <div className="flex items-center gap-2">
            <input
              id="brand-hex"
              type="color"
              value={deriveBrand(hex)?.primary ?? DEFAULT_BRAND}
              onChange={(e) => set(e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1"
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => set(e.target.value)}
              aria-label="Brand colour hex value"
              spellCheck={false}
              className="app-field h-11 w-28 rounded-lg border border-control bg-surface px-3 font-mono text-sm uppercase"
            />
          </div>
        </div>
        <Button variant="ghost" onClick={reset} disabled={isDefault}>
          Reset to default
        </Button>
      </div>

      <section aria-label="Preview" className="mt-7 rounded-xl border border-line app-card p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Preview</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="app-btn-primary inline-flex h-10 items-center rounded-lg border border-primary px-4 font-semibold text-white">
            Save job card
          </button>
          <span className="inline-flex h-10 items-center rounded-lg bg-active px-4 font-medium text-ink">Active tab</span>
          <a href="#" onClick={(e) => e.preventDefault()} className="font-semibold text-primary underline">
            A themed link
          </a>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-0.5 text-xs font-semibold text-ok-ink">
            <span className="size-1.5 rounded-full bg-current" /> Closed
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-0.5 text-xs font-semibold text-warn-ink">
            <span className="size-1.5 rounded-full bg-current" /> Open
          </span>
        </div>
      </section>

      <p className="mt-4 text-xs leading-5 text-muted">
        Status colours (Open, Closed, errors) stay fixed so they're always recognisable. Very light colours are darkened
        automatically to keep button text readable. Saved for this workspace on this device.
      </p>
    </div>
  )
}
