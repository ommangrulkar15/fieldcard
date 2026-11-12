import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { get, post, refreshSession, setAccessToken, SIGNED_OUT_EVENT } from '../lib/api'
import type { Me, Membership } from '../lib/types'

interface TokenResponse {
  access_token: string
}

interface AuthState {
  status: 'loading' | 'anon' | 'authed'
  me: Me | null
  workspace: Membership | null
  setWorkspaceId: (id: string) => void
  can: (permission: string) => boolean
  login: (email: string, password: string) => Promise<void>
  signup: (input: { email: string; password: string; name: string; workspace_name: string; template: string }) => Promise<void>
  demo: (role: 'admin' | 'supervisor' | 'crew') => Promise<void>
  logout: () => Promise<void>
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
const WORKSPACE_KEY = 'fieldcard.workspace'

function savedWorkspace(): string | null {
  try {
    return localStorage.getItem(WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<AuthState['status']>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(savedWorkspace())

  const loadMe = useCallback(async () => {
    setMe(await get<Me>('/auth/me'))
    setStatus('authed')
  }, [])

  useEffect(() => {
    let cancelled = false
    refreshSession().then(async (ok) => {
      if (cancelled) return
      if (!ok) return setStatus('anon')
      try {
        await loadMe()
      } catch {
        if (!cancelled) setStatus('anon')
      }
    })
    const onSignedOut = () => {
      setMe(null)
      setStatus('anon')
      queryClient.clear()
    }
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => {
      cancelled = true
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
    }
  }, [loadMe, queryClient])

  const startSession = useCallback(
    async (token: string) => {
      setAccessToken(token)
      queryClient.clear()
      await loadMe()
    },
    [loadMe, queryClient],
  )

  const value = useMemo<AuthState>(() => {
    const workspace = me?.workspaces.find((w) => w.id === workspaceId) ?? me?.workspaces[0] ?? null
    return {
      status,
      me,
      workspace,
      setWorkspaceId: (id) => {
        setWorkspaceIdState(id)
        try {
          localStorage.setItem(WORKSPACE_KEY, id)
        } catch {
          /* private mode: the choice just will not persist */
        }
      },
      can: (permission) => workspace?.permissions.includes(permission) ?? false,
      login: async (email, password) => {
        const data = await post<TokenResponse>('/auth/login', { email, password })
        await startSession(data.access_token)
      },
      signup: async (input) => {
        const data = await post<TokenResponse>('/auth/signup', input)
        await startSession(data.access_token)
      },
      demo: async (role) => {
        const data = await post<TokenResponse>('/auth/demo', { role })
        await startSession(data.access_token)
      },
      logout: async () => {
        try {
          await post('/auth/logout')
        } finally {
          setAccessToken(null)
          setMe(null)
          setStatus('anon')
          queryClient.clear()
        }
      },
      reload: loadMe,
    }
  }, [status, me, workspaceId, startSession, loadMe, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
