import { DEMO } from '../lib/errors'
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { CloseIcon } from './icons'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'app-btn-primary text-white border-primary font-semibold',
  secondary: 'bg-surface text-ink border-control hover:bg-raised',
  ghost: 'bg-transparent text-ink border-transparent hover:bg-active',
  danger: 'bg-surface text-bad border-control hover:bg-bad-bg',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  small?: boolean
}

export function Button({ variant = 'secondary', small, className = '', type = 'button', ...rest }: ButtonProps) {
  const size = small ? 'h-11 px-3 text-[13px] rounded-md md:h-9' : 'h-11 px-4 rounded-lg'
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 border font-medium whitespace-nowrap cursor-pointer transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${size} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  )
}

export function StatusPill({ status }: { status: string }) {
  const closed = status === 'closed'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        closed ? 'bg-ok-bg text-ok-ink' : 'bg-warn-bg text-warn-ink'
      }`}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {closed ? 'Closed' : 'Open'}
    </span>
  )
}

export function Banner({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  const style = tone === 'error' ? 'bg-bad-bg text-bad border-bad/30' : 'bg-ok-bg text-ok-ink border-ok-ink/20'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${style}`}>
      {children}
    </div>
  )
}

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  /** 'sheet' slides up on phones and sits centred on larger screens. */
  variant?: 'sheet' | 'dialog'
}

/** Built on the native <dialog>, which gives focus trapping and Esc to close for free. */
export function Dialog({ open, onClose, title, children, footer, variant = 'sheet' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      dialog.focus() // focus the dialog itself, not its first button, so no stray focus ring shows on open
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const position =
    variant === 'sheet'
      ? 'max-md:m-0 max-md:mt-auto max-md:w-full max-md:max-w-none max-md:rounded-b-none max-md:max-h-[88dvh]'
      : ''
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose()
      }}
      aria-labelledby="dialog-title"
      tabIndex={-1}
      className={`focus:outline-none m-auto w-[min(520px,calc(100vw-32px))] rounded-2xl bg-surface p-0 text-ink shadow-xl open:flex open:flex-col max-h-[90dvh] ${position}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 -mr-2 cursor-pointer place-items-center rounded-lg hover:bg-active"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap gap-2 border-t border-line px-5 py-4">{footer}</div>}
    </dialog>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-muted">
      <span className="size-4 animate-spin rounded-full border-2 border-control border-t-transparent" aria-hidden="true" />
      {label}
    </div>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  // The demo embeds this screen under the landing page's own h1, so it drops a level there.
  const Tag = DEMO ? 'h2' : 'h1'
  return <Tag className="mb-4 text-2xl font-semibold tracking-tight">{children}</Tag>
}
