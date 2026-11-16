import { useQuery } from '@tanstack/react-query'
import { get } from './api'
import type { Field } from './types'

export function useFields(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['fields', workspaceId],
    queryFn: () => get<Field[]>(`/workspaces/${workspaceId}/fields`, { include_hidden: 'false' }),
    enabled: !!workspaceId,
    staleTime: 60_000,
  })
}
