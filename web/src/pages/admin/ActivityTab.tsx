import { useQuery } from '@tanstack/react-query'
import { Banner, Spinner } from '../../components/ui'
import { ApiError, get } from '../../lib/api'

interface Entry {
  id: number
  actor: string
  action: string
  target: string
  created_at: string
}

const LABELS: Record<string, string> = {
  'member.add': 'Added user',
  'member.role': 'Changed role',
  'member.remove': 'Removed user',
  'member.password_reset': 'Reset password',
  'field.create': 'Added field',
  'field.update': 'Edited field',
  'field.reorder': 'Reordered fields',
  'job.delete': 'Deleted',
  'job.export': 'Exported',
}

export default function ActivityTab({ workspaceId }: { workspaceId: string }) {
  const log = useQuery({ queryKey: ['audit', workspaceId], queryFn: () => get<Entry[]>(`/workspaces/${workspaceId}/audit`) })
  if (log.isLoading) return <Spinner label="Loading activity" />
  if (log.isError) return <Banner tone="error">{(log.error as ApiError).message}</Banner>
  const rows = log.data ?? []
  return (
    <div>
      <p className="mb-4 max-w-xl text-muted">Who changed users, form setup and deleted or exported data. The last 200 entries.</p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((entry) => (
            <li key={entry.id} className="border-b border-line px-4 py-3 last:border-b-0">
              <p className="font-medium">
                {LABELS[entry.action] ?? entry.action}
                {entry.target && <span className="font-normal text-muted"> · {entry.target}</span>}
              </p>
              <p className="text-sm text-muted">
                {entry.actor} ·{' '}
                <time dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
