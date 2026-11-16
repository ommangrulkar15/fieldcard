import type { ReactNode } from 'react'

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const PencilIcon = () => (
  <Icon>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
  </Icon>
)
export const TableIcon = () => (
  <Icon>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 10h18M9 4v16" />
  </Icon>
)
export const UserIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
  </Icon>
)
export const ShieldIcon = () => (
  <Icon>
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
  </Icon>
)
export const LogoutIcon = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
  </Icon>
)
export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
)
export const CloseIcon = () => (
  <Icon>
    <path d="M18 6L6 18M6 6l12 12" />
  </Icon>
)
export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)
export const ChevronIcon = () => (
  <Icon size={16}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)
export const DownloadIcon = () => (
  <Icon>
    <path d="M12 3v12M7 11l5 5 5-5M4 21h16" />
  </Icon>
)

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M8 1.5h13L30.5 11v13a6.5 6.5 0 0 1-6.5 6.5H8A6.5 6.5 0 0 1 1.5 24V8A6.5 6.5 0 0 1 8 1.5Z" fill="#D5CCEE" />
      <path d="M21 1.5V8a3 3 0 0 0 3 3h6.5Z" fill="#B5A8DB" />
      <path d="M9 9h5v16H9zM9 9h11v5H9zM9 17h8v4.5H9z" fill="#43386B" />
    </svg>
  )
}
