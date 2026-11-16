import { useEffect } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { syncBrand } from '../lib/brand'
import { LogoutIcon, Logo, PencilIcon, ShieldIcon, TableIcon, UserIcon } from './icons'
import type { ReactNode } from 'react'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  show: boolean
}

export default function Shell() {
  const location = useLocation()
  const { me, workspace, setWorkspaceId, logout, can } = useAuth()
  useEffect(() => {
    if (workspace?.id) syncBrand(workspace.id)
  }, [workspace?.id])
  const items: NavItem[] = [
    { to: '/entry', label: 'Job Entry', icon: <PencilIcon />, show: can('job:create') },
    { to: '/account', label: 'Account', icon: <UserIcon />, show: true },
    { to: '/data', label: 'Data', icon: <TableIcon />, show: true },
    { to: '/admin', label: 'Admin Panel', icon: <ShieldIcon />, show: can('fields:manage') || can('users:manage') },
  ]
  const visible = items.filter((item) => item.show)
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-lg px-3 h-10 font-medium ${isActive ? 'bg-active text-ink' : 'text-muted hover:bg-raised'}`

  return (
    <div id="fc-app-root" className="app-ground flex min-h-dvh flex-col">
      <header className="app-glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line px-4 md:px-6">
        <div className="flex items-center gap-2 pr-2 text-base font-semibold">
          <Logo />
          Fieldcard
        </div>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {visible.map((item) => (
            <NavLink key={item.to} to={item.to} className={link}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {me && me.workspaces.length > 0 && (
            <>
              <label htmlFor="workspace" className="sr-only">
                Workspace
              </label>
              <select
                id="workspace"
                value={workspace?.id ?? ''}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="h-11 max-w-[190px] truncate rounded-lg border border-control bg-surface px-2 text-sm"
              >
                {me.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="hidden h-10 cursor-pointer items-center gap-2 rounded-lg px-3 font-medium text-muted hover:bg-raised md:flex"
          >
            <LogoutIcon />
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-5 md:px-6 md:pb-10">
        <div key={location.pathname} className="app-enter">
          <Outlet />
        </div>
      </main>

      <nav
        aria-label="Main"
        className="app-glass fixed inset-x-0 bottom-0 z-20 flex border-t border-line pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                isActive ? 'text-ink' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`rounded-full px-4 py-1 ${isActive ? 'bg-active' : ''}`}>{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
