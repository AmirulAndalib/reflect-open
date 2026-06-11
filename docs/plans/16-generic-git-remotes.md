# Plan 16 — Generic Git Remotes (Bring Your Own Host)

**Goal:** Back up and sync a graph to **any git remote** — GitLab, Gitea, Codeberg,
GitHub Enterprise, a self-hosted server, or a bare repo on a NAS — with **zero new UI**.
The contract: a user runs `git init` (or Reflect already did) and
`git remote add origin <url>` in their graph, and the existing sync loop (Plan 12)
adopts it — debounced commit → push, pull/merge on launch/focus, conflicts-as-data.
Everything else just works.

**Depends on:** Plan 12 (the whole sync loop; this plan only widens its credential
story). **Status:** proposed.

**Explicitly not in scope:** host pickers, a "custom remote" wizard, per-host settings
UI, or per-host REST sugar (repo creation, visibility checks, install links — those
stay GitHub-only conveniences). File-sync providers (iCloud/Dropbox) remain unsupported
by design; this plan is about other *git hosts*, not other *sync mechanisms*.

## Where we stand (why it doesn't work today)

The Plan 12 architecture already did most of the work: the Rust layer speaks
`remote URL + credential callback` and the engine/controller/conflict policy are
host-agnostic. Four things block a hand-wired remote:

1. **Adoption gating.** `backup-controller.start()` refuses to adopt unless a
   **GitHub** credential is stored (`loadGithubAuth() !== null`), even though the
   repo + remote are fine.
2. **Credential routing — also today's one security wart.** The engine feeds
   `getGithubToken()` into every fetch/push, and `remote.rs` sends it as
   `x-access-token:<token>` basic auth to **whatever host origin points at**. A
   hand-wired non-GitHub origin would today (a) fail auth and (b) leak the user's
   GitHub token to that host. Fixing the routing is worth landing even if the rest
   of this plan stalls.
3. **HTTPS-only build.** `git2` is compiled `default-features = false,
   features = ["https", "vendored-libgit2"]` — `git@host:…` remotes cannot connect
   at all, and SSH is the URL form most users will paste.
4. **Credential callback is token-or-fail.** `callbacks_with_credentials(None)`
   errors with "no token is connected" instead of trying anything local.

Already in place and reused as-is: nullable token plumbing end-to-end
(`gitFetch(token: string | null)` → `Option<String>`), `PushOutcome` rejections-as-data,
conflict markers + protected notes, `parseGithubRemote` returning `null` for foreign
URLs (the controller already carries `repo: null` without falling over).

## Design

### 1. Remote-aware credential routing (core TS)

Classify the remote once at adoption: `parseGithubRemote(remoteUrl)` non-null →
**github**, else **generic**.

- **github** → unchanged: `getToken: () => getGithubToken(providerFetch)` (device-flow
  refresh and all).
- **generic** → `getToken: () => null`, always. The Rust side resolves credentials
  locally (below). The stored GitHub credential is **never** offered to a non-GitHub
  host — closing wart (2).

GitHub Enterprise falls out naturally: `ghe.corp.com` doesn't parse as github.com, so
it takes the generic path and authenticates with whatever the user's git credential
helper holds — which is exactly the GHES story we wanted anyway.

### 2. Local credential resolution (Rust, `remote.rs`)

When the per-call token is `None`, the credential callback becomes a chain driven by
libgit2's `allowed` types instead of an error:

- `USER_PASS_PLAINTEXT` (HTTPS) → `Cred::credential_helper(&repo.config()?, url,
  username_from_url)`. git2-rs implements helper execution itself: it reads
  `credential.helper` from git config and runs the helper (`osxkeychain` on macOS,
  `manager` on Windows, `libsecret`/`store` on Linux). **This is the whole trick** —
  the user's one-time `git push` from a terminal stores a login in the same place
  we read from. We *read* helpers, never write them.
- `SSH_KEY` (ssh remotes) → `Cred::ssh_key_from_agent(username_from_url
  .unwrap_or("git"))`, falling back to the default key files
  (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, unencrypted only — passphrase prompting is
  UI and stays out; passphrase keys work via the agent).
- `DEFAULT` → `Cred::default()` (NTLM/Negotiate proxies; cheap to include).

**Retry guard:** libgit2 re-invokes the callback after a rejected credential, which
loops forever if the chain keeps producing the same answer. Track attempted types in
the existing `RefCell` pattern and return a clear `Auth` error once the chain is
exhausted — message names what was tried ("credential helper had no login for
gitlab.com; run `git push` from a terminal once so it stores one").

When the token is `Some(…)` (GitHub path) behavior is byte-for-byte today's.

### 3. SSH transport

`git2 = { features = ["https", "ssh", "vendored-libgit2"] }` — adds vendored
`libssh2`. Host-key verification: libgit2 ≥ 1.5 enforces known_hosts checking by
default (post-CVE-2023-22742); we keep the default and **do not** install a
permissive `certificate_check`. An unknown host fails with a hint:
"connect once with `ssh <host>` so it's added to known_hosts".

Recommendation: **SSH ships in this wave.** `git@…` is the URL form muscle memory
produces; without it, "add a remote and it just works" fails for most of the target
persona. It's isolated in Phase 3 so it can be cut to HTTPS-only if the spike turns
up build pain (signing/notarization of vendored libssh2, binary size, Windows).

### 4. Adoption gating (backup controller)

`start()` adopts when `status.initialized && remoteUrl !== null` — and then:

- **github remote** → still requires `loadGithubAuth() !== null` (otherwise
  `disconnected`, as today: the wizard is the fix).
- **generic remote** → adopt unconditionally. If local credentials turn out missing,
  the first cycle surfaces the auth error in the existing status UI and the engine
  keeps retrying on focus — same shape as any other sync error, no new states.

### 5. Existing-surface degradation audit (not new UI)

The generic path bypasses the wizard entirely, but a few connected-state surfaces
assume GitHub when `repo === null`:

- Settings/status panel: show the bare remote URL (already carried in state); hide
  "View on GitHub"-style affordances and the app-install link.
- `auth`-state recovery action: for github remotes it reopens the wizard; for generic
  remotes the message points at the terminal ("check that `git push` works from a
  terminal in this graph") instead of a sign-in that can't help.
- Public-repo confirmation: API-based, GitHub-only. Generic remotes skip it — wiring
  your own remote is the opt-in. Documented loudly (notes marked `private: true` are
  in the backup; host visibility is the user's responsibility).
- `MAX_FILE_BYTES` (95 MB) guard stays for all remotes (every sensible host has a
  limit; ours just mirrors GitHub's). Message drops the "for GitHub" phrasing.

### 6. Restore on a new machine

`git clone <url>` in a terminal, then open the folder as a graph. Adoption (§4) picks
the remote up and the index rebuilds from files (Plan 04). This already nearly works;
it becomes the documented generic-restore path. Restore-from-GitHub dialog stays
GitHub-only.

### 7. Free bonus: path remotes

With credential resolution no longer token-or-fail, **file-path remotes work with no
credentials at all**: `git init --bare /Volumes/NAS/notes.git && git remote add origin
/Volumes/NAS/notes.git` gives local/NAS/USB backup for free — and bare-repo remotes
become the medium for cheap full-loop integration tests (commit → push → clone →
conflict → merge, zero network, zero mocks).

## Phases

**Phase 0 — Spike (timeboxed, settles the two real unknowns).**
(a) `Cred::credential_helper` from inside the GUI app on macOS: helpers resolve via
`git` on a GUI-app `PATH` (`/usr/bin` has Apple git, but CLT presence and helper
discovery need proving — same class of gotcha as the CLI sidecar). (b) SSH: agent auth
against a real host from the packaged app + confirm libgit2's default known_hosts
enforcement in our vendored version. Outcome decides whether Phase 3 ships now or
the plan goes HTTPS-first.

**Phase 1 — Rust.** Credential chain + retry guard in `remote.rs`; error-taxonomy
pass in `error.rs` (today anchors on `ErrorCode::Auth` + HTTP status substrings; add
the SSH/certificate classes so helper-miss, rejected key, and host-key failures all
land in `Auth`/`Network` correctly, with the negative tests that pinned the last
round). Integration tests over local bare-repo remotes with `token: None`.

**Phase 2 — Core TS + controller.** Remote classification, `getToken` routing
(github → token, generic → null), adoption gating, status-message wording, the §5
audit. Unit tests: classification, controller adopts a generic remote with no stored
GitHub auth, github-auth never requested for generic remotes.

**Phase 3 — SSH build.** Cargo feature change, CI (macOS sign/notarize with vendored
libssh2, Windows/Linux builds), binary-size delta recorded in the PR.

**Phase 4 — Docs + validation.** README/docs "Use any git host" section with the
exact terminal recipe (init, remote add, one `git push -u` to seed the credential
helper); Plan 12's Deferred line moves to a pointer here; manual matrix before ship:
GitLab.com (HTTPS + helper), GitLab/Gitea over SSH, Gitea in Docker, bare path remote,
GHES if reachable. Memory + libraries.md updates.

## Failure cases

| Case | Behavior |
| --- | --- |
| No credential anywhere (helper empty, no agent) | `Auth` error in status: "couldn't sign in to origin — run `git push` from a terminal in this graph once". Engine retries on focus; nothing wedges. |
| Helper exists but prompts (GCM UI) | Helper runs outside our process; worst case it pops its own dialog or fails → `Auth` error as above. Spike confirms osxkeychain never prompts. |
| Unknown SSH host key | Fail (no bypass): "connect once with `ssh <host>`…". |
| Host rejects a push (protected branch, size limits, hooks) | Already data: `PushOutcome.rejection_message` surfaces verbatim, non-FF retries merge-then-push as today. |
| Remote deleted / URL typo | Existing not-found/network mapping; status error, retry on focus. |
| GitHub token near a generic remote | Never sent (§1). The reverse — helper credentials for github.com — also never happens; github remotes always use the managed token. |

## Deferred

- Per-host token entry UI / per-host keychain entries (the moment we want "no
  terminal ever" for non-GitHub hosts).
- Writing credentials back to helpers; SSH passphrase prompting.
- GitLab/Gitea REST sugar (repo creation, visibility checks) behind the same
  one-module-per-host pattern as `github.ts`.
- `git://` and proxy edge cases beyond what libgit2 defaults handle.
