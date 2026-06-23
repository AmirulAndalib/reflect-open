import { useEffect, useRef, type ReactElement } from 'react'
import { toast } from 'sonner'
import { type Operation, useOperations } from '@/lib/operations'

/**
 * The global status surface (foundations hardening): a small, unobtrusive
 * stack for background operations that outlive their pane — the rename
 * rewrite is the first tenant; indexing/sync states can migrate here as
 * they're touched. Renders nothing when idle.
 */

const TOAST_DURATION_MS = Number.POSITIVE_INFINITY

function toastId(operation: Operation): string {
  return `operation-${operation.id}`
}

function descriptionFor(operation: Operation): string | undefined {
  if (operation.status !== 'running' && operation.message !== null) {
    return operation.message
  }
  if (operation.progress !== null) {
    return `${operation.progress.done}/${operation.progress.total}`
  }
  return operation.description ?? undefined
}

export function OperationsStatus(): ReactElement | null {
  const operations = useOperations()
  const shownIds = useRef<Set<number>>(new Set())

  useEffect(() => {
    const nextIds = new Set(operations.map((operation) => operation.id))
    for (const id of shownIds.current) {
      if (!nextIds.has(id)) {
        toast.dismiss(`operation-${id}`)
      }
    }

    for (const operation of operations) {
      const action = operation.action
        ? {
            label: operation.action.label,
            onClick: () => void operation.action?.run(),
          }
        : undefined
      const options = {
        id: toastId(operation),
        description: descriptionFor(operation),
        duration: TOAST_DURATION_MS,
        action,
      }

      switch (operation.status) {
        case 'failed':
          toast.error(operation.label, options)
          break
        case 'warning':
          toast.warning(operation.label, options)
          break
        case 'running':
          toast.message(operation.label, options)
          break
      }
    }

    shownIds.current = nextIds
  }, [operations])

  return null
}
