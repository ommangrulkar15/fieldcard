import { useCallback, useEffect, useRef, useState } from 'react'
import { BRAND_PRESETS, deriveBrand } from '../lib/brand'

type Device = 'phone' | 'laptop'
type Role = 'admin' | 'supervisor' | 'crew'

const SIZE: Record<Device, { w: number; h: number; pad: number }> = {
  phone: { w: 390, h: 760, pad: 12 },
  laptop: { w: 1100, h: 660, pad: 14 },
}
const SWATCHES = BRAND_PRESETS.filter((p) => ['Grape (default)', 'Teal', 'Ocean', 'Emerald', 'Rose', 'Amber'].includes(p.name))
const ROLES: { id: Role; label: string }[] = [
  { id: 'crew', label: 'Crew' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'admin', label: 'Admin' },
]

const seg = (on: boolean) =>
  `inline-flex active:scale-[0.97] h-11 cursor-pointer items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors duration-200 ${
    on ? 'bg-[var(--fc-deep)] text-white' : 'text-[var(--fc-ink)] hover:bg-[var(--fc-light)]'
  }`

export default function DemoStage() {
  const base = import.meta.env.BASE_URL
  const frame = useRef<HTMLIFrameElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [device, setDevice] = useState<Device>('phone')
  const [avail, setAvail] = useState(1100)
  const [brand, setBrand] = useState<string>(SWATCHES[0].hex)
  const [role, setRole] = useState<Role>('admin')
  const [saved, setSaved] = useState(false)
  const timer = useRef<number>(0)

  const send = useCallback((msg: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage(msg, '*')
  }, [])

  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    setAvail(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const show = useCallback(
    (d: Device) => {
      window.clearTimeout(timer.current)
      setDevice(d)
      setSaved(false)
      send({ type: 'go', to: d === 'phone' ? '/entry' : '/data' })
    },
    [send],
  )

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || (e.data as { type?: string })?.type !== 'saved') return
      setSaved(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        setDevice('laptop')
        send({ type: 'go', to: '/data' })
        setSaved(false)
      }, 2600)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer.current)
    }
  }, [send])

  const pick = (hex: string) => {
    setBrand(hex)
    send({ type: 'brand', hex: hex === SWATCHES[0].hex ? null : hex })
  }
  const chooseRole = (r: Role) => {
    setRole(r)
    send({ type: 'role', role: r })
  }
  const reset = () => {
    window.clearTimeout(timer.current)
    setSaved(false)
    setDevice('phone')
    send({ type: 'reset' })
  }
  // Re-apply choices once the frame (re)loads.
  const onLoad = () => {
    send({ type: 'brand', hex: brand === SWATCHES[0].hex ? null : brand })
    if (role !== 'admin') send({ type: 'role', role })
  }

  const { w, h, pad } = SIZE[device]
  const scale = Math.min(1, (avail - pad * 2) / w)
  const outerW = Math.round(w * scale + pad * 2)
  const screenH = Math.round(h * scale)
  const phone = device === 'phone'

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Choose a screen" className="flex rounded-xl border border-[var(--fc-light)] bg-[var(--fc-paper)] p-1">
          <button type="button" aria-pressed={phone} onClick={() => show('phone')} className={seg(phone)}>
            On site · Phone
          </button>
          <button type="button" aria-pressed={!phone} onClick={() => show('laptop')} className={seg(!phone)}>
            In the office · Laptop
          </button>
        </div>
        <details className="fc-customise">
          <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[var(--fc-ink)] hover:bg-[var(--fc-light)]">
            Customise
            <span aria-hidden="true" className="fc-plus text-lg leading-none">+</span>
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Brand colour" className="flex items-center gap-1">
          <span className="mr-1 whitespace-nowrap text-sm text-[var(--fc-ink)]">Brand colour</span>
          {SWATCHES.map((s) => (
            <button
              key={s.hex}
              type="button"
              aria-pressed={brand === s.hex}
              aria-label={s.name}
              title={`${s.name} (text stays readable)`}
              onClick={() => pick(s.hex)}
              className="grid size-11 cursor-pointer place-items-center rounded-full"
            >
              <span
                className="size-7 rounded-full border-2 transition-transform duration-200"
                style={{
                  background: deriveBrand(s.hex)?.primary ?? s.hex,
                  borderColor: brand === s.hex ? 'var(--fc-ink)' : 'transparent',
                  transform: brand === s.hex ? 'scale(1.15)' : 'none',
                }}
              />
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--fc-ink)]">
          Try it as
          <select
            value={role}
            onChange={(e) => chooseRole(e.target.value as Role)}
            className="h-11 rounded-lg border border-[var(--fc-light)] bg-[var(--fc-paper)] px-3 font-semibold"
          >
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
          </div>
        </details>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 cursor-pointer items-center text-sm font-semibold underline underline-offset-4 hover:text-[var(--fc-deep)]"
        >
          Reset demo
        </button>
      </div>

      <p role="status" className="mt-5 min-h-7 text-base font-semibold text-[var(--fc-deep)]">
        {saved
          ? 'Saved. Taking it to the office laptop…'
          : phone
            ? 'Step 1. You are the crew on site. Press Save job card.'
            : 'Step 2. In the office, your job is already at the top of the table.'}
      </p>

      <div ref={stage} className="mt-4 flex justify-center">
        <div
          className="fc-demo-device"
          data-device={device}
          style={{ width: outerW, padding: pad, borderRadius: phone ? 44 : 20 }}
        >
          {phone && <span className="fc-demo-island" aria-hidden="true" />}
          {saved && (
            <span className="fc-demo-tick" aria-hidden="true">
              <span>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
            </span>
          )}
          <div className="fc-demo-screen" style={{ height: screenH, borderRadius: phone ? 32 : 8 }}>
            <iframe
              ref={frame}
              onLoad={onLoad}
              title={phone ? 'Fieldcard live demo, phone view' : 'Fieldcard live demo, laptop view'}
              src={`${base}demo.html`}
              loading="lazy"
              style={{ width: w, height: h, transform: `scale(${scale})` }}
            />
          </div>
        </div>
      </div>
      {!phone && <div className="fc-demo-base mx-auto" style={{ width: outerW }} aria-hidden="true" />}
      <p className="mt-6 max-w-2xl text-sm text-[var(--fc-ink)]">
        The same job is on both screens. Sample data only: nothing you type is sent or stored, and Reset demo puts it all back.
      </p>
    </div>
  )
}
