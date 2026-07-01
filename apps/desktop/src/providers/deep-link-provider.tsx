import { useEffect, type ReactElement, type ReactNode } from 'react'
import type { GraphInfo } from '@reflect/core'
import { handleDeepLink } from '@/lib/deep-links/handle'
import { setDeepLinkHandler } from '@/lib/deep-links/intents'
import { useRouter } from '@/routing/router'

/**
 * Routes incoming `reflect://` URLs into the open graph session: attaches
 * this workspace's handler to the app-lifetime intake (`intents.ts`), which
 * replays anything that arrived before a graph was open. No UI — outcomes
 * surface as navigation or a toast inside {@link handleDeepLink}.
 */

interface DeepLinkProviderProps {
  graph: GraphInfo
  children: ReactNode
}

export function DeepLinkProvider({ graph, children }: DeepLinkProviderProps): ReactElement {
  const { navigate } = useRouter()

  useEffect(() => {
    setDeepLinkHandler((url) => {
      handleDeepLink(url, { navigate, generation: graph.generation }).catch((cause: unknown) => {
        console.error('deep link failed:', url, cause)
      })
    })
    return () => {
      setDeepLinkHandler(null)
    }
  }, [navigate, graph.generation])

  return <>{children}</>
}
