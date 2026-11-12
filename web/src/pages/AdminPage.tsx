import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { PageTitle } from '../components/ui'
import FormSetup from './admin/FormSetup'
import ActivityTab from './admin/ActivityTab'
import UsersTab from './admin/UsersTab'

export default function AdminPage() {
  const { workspace, can } = useAuth()
  const tabs = [
    { id: 'form', label: 'Form setup', show: can('fields:manage') },
    { id: 'users', label: 'Users', show: can('users:manage') },
    { id: 'activity', label: 'Activity', show: can('users:manage') },
  ].filter((tab) => tab.show)
  const [active, setActive] = useState(tabs[0]?.id)
  if (!workspace) return null

  return (
    <div className="mx-auto max-w-[860px]">
      <PageTitle>Admin Panel</PageTitle>
      <div role="tablist" aria-label="Admin sections" className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`panel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={`-mb-px h-11 cursor-pointer border-b-2 px-4 font-medium ${
              active === tab.id ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'form' && <FormSetup workspaceId={workspace.id} />}
        {active === 'users' && <UsersTab workspaceId={workspace.id} />}
        {active === 'activity' && <ActivityTab workspaceId={workspace.id} />}
      </div>
    </div>
  )
}
