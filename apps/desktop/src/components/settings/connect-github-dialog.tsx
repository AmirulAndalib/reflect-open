import { type ReactElement } from 'react'
import { InlineAlert } from '@/components/inline-alert'
import { GithubAuthStep } from '@/components/settings/github-auth-step'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useConnectGithubWizard, type ConnectWizardStep } from '@/hooks/use-connect-github-wizard'
import { useRestoreFocus } from '@/hooks/use-restore-focus'

interface ConnectGithubDialogProps {
  /** A suggested name for a newly created backup repo (from the graph name). */
  suggestedRepoName: string
  onClose: () => void
  /** Delay between repo-existence polls on the create handoff (test hook). */
  pollIntervalMs?: number
}

const STEP_DESCRIPTIONS: Record<ConnectWizardStep, string> = {
  repo: 'Back up this graph to a private GitHub repository.',
  auth: 'Sign in so Reflect can push your backups.',
  finish: 'Connecting your repository…',
}

/**
 * The desktop "Connect GitHub" dialog — a Dialog shell over
 * {@link useConnectGithubWizard}, which owns the whole flow (repo → sign-in →
 * connect, with the create-handoff/grant-access polls and the public-repo
 * consent gate). The mobile drawer renders the same hook; flow changes belong
 * there, not here.
 */
export function ConnectGithubDialog({
  suggestedRepoName,
  onClose,
  pollIntervalMs = 3000,
}: ConnectGithubDialogProps): ReactElement {
  const wizard = useConnectGithubWizard({ suggestedRepoName, onClose, pollIntervalMs })

  useRestoreFocus()

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose()
        }
      }}
    >
      <DialogContent showCloseButton={false} className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
          <DialogDescription>{STEP_DESCRIPTIONS[wizard.step]}</DialogDescription>
        </DialogHeader>

        {wizard.step === 'repo' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="repo-mode"
                  checked={wizard.mode === 'create'}
                  onChange={() => wizard.setMode('create')}
                />
                Create a new private repository
              </label>
              {wizard.mode === 'create' ? (
                <Input
                  autoFocus
                  value={wizard.repoName}
                  onChange={(event) => wizard.setRepoName(event.target.value)}
                  className="ml-6 w-auto"
                  aria-label="New repository name"
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm text-text">
                <input
                  type="radio"
                  name="repo-mode"
                  checked={wizard.mode === 'existing'}
                  onChange={() => wizard.setMode('existing')}
                />
                Use an existing repository
              </label>
              {wizard.mode === 'existing' ? (
                <Input
                  autoFocus
                  value={wizard.existingRepo}
                  onChange={(event) => wizard.setExistingRepo(event.target.value)}
                  placeholder="owner/name"
                  className="ml-6 w-auto"
                  aria-label="Existing repository"
                />
              ) : null}
            </div>
            <Button onClick={wizard.continueFromRepo} size="sm">
              Continue
            </Button>
          </div>
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
                  Anyone on the internet can read everything in this graph, including notes
                  marked private.
                </InlineAlert>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={wizard.backToRepo}>
                    Choose another repo
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={wizard.pending || wizard.user === null}
                    onClick={wizard.confirmPublic}
                  >
                    Back up to a public repo
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
                <div className="flex gap-2">
                  <Button size="sm" onClick={wizard.openCreatePage}>
                    Create on GitHub…
                  </Button>
                  <Button variant="outline" size="sm" onClick={wizard.backToRepo}>
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
                <div className="flex gap-2">
                  <Button size="sm" onClick={wizard.openInstallPage}>
                    Grant access on GitHub…
                  </Button>
                  <Button variant="outline" size="sm" onClick={wizard.backToRepo}>
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
                  // A failed connect must never strand the user here — offer the
                  // way back to a different repository. (The create guide and
                  // grant-access step render their own escapes, so both are
                  // excluded.)
                  <Button variant="outline" size="sm" onClick={wizard.backToRepo}>
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
      </DialogContent>
    </Dialog>
  )
}
