import { type ReactElement } from 'react'
import { useGraph } from '@/providers/graph-provider'

/**
 * First-run / no-graph screen: open a folder as a graph, or reopen a recent one.
 * Shown by `App` whenever no graph is active (Plan 02 loading gate).
 */
export function GraphChooser(): ReactElement {
  const { recents, error, pickAndOpen, openRecent, forget } = useGraph()

  return (
    <div className="flex h-screen w-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Open a graph</h1>
          <p className="text-sm text-[color:var(--text-secondary)]">
            Pick a folder for your notes — Reflect stores them as plain markdown.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void pickAndOpen()}
          className="w-full rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--text-on-brand,#fff)]"
        >
          Open graph…
        </button>

        {error ? (
          <p role="alert" className="text-center text-sm text-red-500">
            {error}
          </p>
        ) : null}

        {recents.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-[color:var(--text-muted)] uppercase">
              Recent
            </p>
            <ul className="space-y-1">
              {recents.map((recent) => (
                <li
                  key={recent.root}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <button
                    type="button"
                    onClick={() => void openRecent(recent.root)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{recent.name}</span>
                    <span className="block truncate text-xs text-[color:var(--text-muted)]">
                      {recent.root}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void forget(recent.root)}
                    aria-label={`Forget ${recent.name}`}
                    className="shrink-0 text-xs text-[color:var(--text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                  >
                    Forget
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
