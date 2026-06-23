import { useEffect, type ReactElement } from 'react'
import { toast } from 'sonner'
import { useUpdate } from '@/providers/update-provider'

const UPDATE_TOAST_ID = 'reflect-update'
const PERSISTENT_TOAST_MS = Number.POSITIVE_INFINITY

/** Mirrors the auto-update lifecycle into the global Sonner notification surface. */
export function UpdateToast(): ReactElement | null {
  const { state, install, restart } = useUpdate()

  useEffect(() => {
    switch (state.phase) {
      case 'available':
        toast.message('Update available', {
          id: UPDATE_TOAST_ID,
          description: `Reflect ${state.version} is ready to install.`,
          duration: PERSISTENT_TOAST_MS,
          action: {
            label: 'Install',
            onClick: () => void install(),
          },
        })
        break
      case 'downloading':
        toast.loading('Downloading update', {
          id: UPDATE_TOAST_ID,
          description: state.percent !== null ? `${state.percent}%` : 'Preparing…',
          duration: PERSISTENT_TOAST_MS,
        })
        break
      case 'ready':
        toast.success('Update ready', {
          id: UPDATE_TOAST_ID,
          description: `Reflect ${state.version} will finish updating after restart.`,
          duration: PERSISTENT_TOAST_MS,
          action: {
            label: 'Restart',
            onClick: () => void restart(),
          },
        })
        break
      case 'error':
        if (state.during === 'install') {
          toast.error('Update failed', {
            id: UPDATE_TOAST_ID,
            description: state.message,
            duration: PERSISTENT_TOAST_MS,
            action: {
              label: 'Retry install',
              onClick: () => void install(),
            },
          })
        } else {
          toast.dismiss(UPDATE_TOAST_ID)
        }
        break
      default:
        toast.dismiss(UPDATE_TOAST_ID)
        break
    }
  }, [install, restart, state])

  return null
}
