import { startOperation } from '@/lib/operations'

/**
 * The one user-visible refusal for an `ambiguous` title resolution
 * (`resolveOrCreateNoteWithTitle`): several notes may claim the title's exact
 * or fallback key, or an unavailable collision prevents proving uniqueness.
 * Neither navigation nor creation may guess in those states.
 */
export function reportAmbiguousNoteTitle(operationLabel: string, title: string): void {
  startOperation(operationLabel).fail(
    `Couldn’t safely choose one note matching “${title}”. Rename conflicting notes or wait for unavailable notes to become available, then try again.`,
  )
}
