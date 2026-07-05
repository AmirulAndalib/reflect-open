import { useId, type ReactElement } from 'react'
import { InlineAlert } from '@/components/inline-alert'
import { GithubAuthStep } from '@/components/settings/github-auth-step'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { useConnectGithubWizard, type ConnectWizardStep } from '@/hooks/use-connect-github-wizard'

interface ConnectGithubDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Delay between repo-existence polls on the create handoff (test hook). */
  pollIntervalMs?: number
}

const STEP_DESCRIPTIONS: Record<ConnectWizardStep, string> = {
  repo: 'Back up this graph to a private GitHub repository and sync it with Reflect on your other devices.',
  auth: 'Sign in so Reflect can push your backups.',
  finish: 'Connecting your repository…',
}

const FIELD_LABEL_CLASS = 'text-xs font-medium text-text-secondary'

/**
 * The mobile "Connect GitHub" bottom sheet — a Drawer shell over
 * {@link useConnectGithubWizard} (the same state machine as desktop's
 * {@link ConnectGithubDialog}); flow changes belong in the hook, not here.
 * Offered only for the local ("This device") graph: iCloud graphs sync
 * through the container, and a Git remote and iCloud sync are mutually
 * exclusive per graph (Plan 21).
 *
 * The wizard body mounts per open cycle, so a dismissed half-finished run
 * never leaks its step/state into the next open — and unmounting also stops
 * the wizard's repo polls and the auth step's device-flow poll.
 */
export function ConnectGithubDrawer({
  open,
  onOpenChange,
  pollIntervalMs,
}: ConnectGithubDrawerProps): ReactElement {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent aria-label="Connect GitHub">
        {open ? (
          <ConnectWizardSheet
            onClose={() => onOpenChange(false)}
            {...(pollIntervalMs !== undefined ? { pollIntervalMs } : {})}
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

/** The sheet body — separate so each open starts a fresh wizard. */
function ConnectWizardSheet({
  onClose,
  pollIntervalMs,
}: {
  onClose: () => void
  pollIntervalMs?: number
}): ReactElement {
  // Never derived from the graph name: the local graph's display name is the
  // sandbox folder's basename — literally "Documents".
  const wizard = useConnectGithubWizard({
    suggestedRepoName: 'reflect-backup',
    onClose,
    ...(pollIntervalMs !== undefined ? { pollIntervalMs } : {}),
  })
  const createNameId = useId()
  const existingRepoId = useId()

  return (
    <div className="flex flex-col gap-3">
      <DrawerTitle>Connect GitHub</DrawerTitle>
      <p className="text-xs text-text-muted">{STEP_DESCRIPTIONS[wizard.step]}</p>

      {wizard.step === 'repo' ? (
        <>
          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 items-center gap-3 text-[15px] text-text">
              <input
                type="radio"
                name="repo-mode"
                checked={wizard.mode === 'create'}
                onChange={() => wizard.setMode('create')}
              />
              Create a new private repository
            </label>
            {wizard.mode === 'create' ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={createNameId} className={FIELD_LABEL_CLASS}>
                  Repository name
                </label>
                <Input
                  id={createNameId}
                  value={wizard.repoName}
                  enterKeyHint="go"
                  onChange={(event) => wizard.setRepoName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      wizard.continueFromRepo()
                    }
                  }}
                />
              </div>
            ) : null}
            <label className="flex min-h-11 items-center gap-3 text-[15px] text-text">
              <input
                type="radio"
                name="repo-mode"
                checked={wizard.mode === 'existing'}
                onChange={() => wizard.setMode('existing')}
              />
              Use an existing repository
            </label>
            {wizard.mode === 'existing' ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={existingRepoId} className={FIELD_LABEL_CLASS}>
                  Repository
                </label>
                <Input
                  id={existingRepoId}
                  value={wizard.existingRepo}
                  placeholder="owner/name"
                  autoCapitalize="none"
                  autoCorrect="off"
                  enterKeyHint="go"
                  onChange={(event) => wizard.setExistingRepo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      wizard.continueFromRepo()
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
          <Button onClick={wizard.continueFromRepo}>Continue</Button>
        </>
      ) : null}

      {wizard.step === 'auth' ? (
        <GithubAuthStep
          onAuthed={wizard.onAuthed}
          repoName={wizard.mode === 'create' ? wizard.repoName.trim() : undefined}
        />
      ) : null}

      {wizard.step === 'finish' ? (
        <div className="flex flex-col gap-3">
          {wizard.user !== null ? (
            <p className="text-xs text-text-muted">
              Signed in as <strong className="text-text">{wizard.user.login}</strong>
            </p>
          ) : null}

          {wizard.publicConfirm !== null ? (
            <>
              <InlineAlert tone="error">
                <strong>
                  {wizard.publicConfirm.owner}/{wizard.publicConfirm.name} is public.
                </strong>{' '}
                Anyone on the internet can read everything in this graph, including notes marked
                private.
              </InlineAlert>
              <div className="flex flex-col gap-2">
                <Button
                  variant="destructive"
                  disabled={wizard.pending || wizard.user === null}
                  onClick={wizard.confirmPublic}
                >
                  Back up to a public repo
                </Button>
                <Button variant="outline" onClick={wizard.backToRepo}>
                  Choose another repo
                </Button>
              </div>
            </>
          ) : wizard.showCreateGuide && wizard.user !== null ? (
            <>
              <p className="text-sm text-text">
                Create{' '}
                <strong>
                  {wizard.user.login}/{wizard.repoName.trim()}
                </strong>{' '}
                on GitHub. Reflect will connect it as soon as it exists.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={wizard.openCreatePage}>Create on GitHub…</Button>
                <Button variant="outline" onClick={wizard.backToRepo}>
                  Change repository
                </Button>
              </div>
              <p className="text-xs text-text-muted">Waiting for the repository…</p>
              {wizard.authKind === 'app' ? (
                <p className="text-xs text-text-muted">
                  If it doesn’t connect,{' '}
                  <button type="button" className="underline" onClick={wizard.openInstallPage}>
                    grant the Reflect app access
                  </button>{' '}
                  to just this repository.
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  If it doesn’t connect, add it to your token’s repository access.
                </p>
              )}
            </>
          ) : wizard.showGrantAccess && wizard.targetForUser !== null ? (
            <>
              <p className="text-sm text-text">
                Give Reflect access to{' '}
                <strong>
                  {wizard.targetForUser.owner}/{wizard.targetForUser.name}
                </strong>{' '}
                so it can back up here.
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={wizard.openInstallPage}>Grant access on GitHub…</Button>
                <Button variant="outline" onClick={wizard.backToRepo}>
                  Change repository
                </Button>
              </div>
              {/* Steer to per-repo selection: the backup needs exactly one
                  repo, so "All repositories" is needless account-wide risk. */}
              <p className="text-xs text-text-muted">
                On GitHub, choose <strong>Only select repositories</strong> — Reflect only needs
                this one.
              </p>
              <p className="text-xs text-text-muted">Waiting for access…</p>
            </>
          ) : wizard.pending ? (
            <p className="text-sm text-text-muted">Connecting…</p>
          ) : null}

          {!wizard.pending && wizard.error !== null ? (
            <>
              <InlineAlert tone="error">{wizard.error}</InlineAlert>
              {wizard.publicConfirm === null &&
              !wizard.showCreateGuide &&
              !wizard.showGrantAccess ? (
                <Button variant="outline" onClick={wizard.backToRepo}>
                  Change repository
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {wizard.step !== 'finish' && wizard.error !== null ? (
        <InlineAlert tone="error">{wizard.error}</InlineAlert>
      ) : null}
    </div>
  )
}
