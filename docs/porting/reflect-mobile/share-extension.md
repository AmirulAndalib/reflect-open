# Porting the share extension

**v2 status: implemented.** The `ShareExtension` target
(`gen/apple/ShareExtension/`, declared in `ios.project.yml`) accepts URLs,
web pages, and text from the share sheet and spools Plan 11 capture
envelopes into the App Group inbox (`group.app.reflect/inbox/`) — entirely
offline, no network, no graph access. The main app relays them into
`.reflect/inbox/` (`capture_shared_inbox_relay`, `src-tauri/src/capture.rs`)
and the shared drain/enrich pipeline materializes them; the mobile tree
mounts `CaptureProvider`, which relays + drains on graph open and on every
foreground (`visibilitychange`). Safari captures carry title, selection,
and the meta description in-page (`ExtensionClass.js` →
`metaDescription`), so an offline save still reads complete; enrichment
replaces the description later when online. Non-URL text saves as a
daily-note bullet (`kind: append`, `source: ios-share`). Remaining
release-gate work: a device pass on a TestFlight build (earlier TestFlight
builds failed every share because CI's export dropped the appex App Group
entitlement — see the CI-signing note under Resolved decisions).

## What V1 mobile does

A separate SwiftUI extension target, `ios/App/ShareExtension/`:

- **Accepts** URLs, web pages, and text from the iOS share sheet
  (`Info.plist` activation rules: 1 web URL, text, 1 web page, dictionary
  version 2 for Chrome compatibility).
- **Extracts page metadata in-page**: `ExtensionClass.js` runs as an
  extension preprocessor and pulls `document.title`, the URL, the current
  text selection, and `og:description`/`description` meta tags.
- **Authenticates without the app**: OAuth access tokens and the current
  graph ID are read from App Group defaults (`group.ReflectData`,
  `ios/App/Shared/ReflectDefaults.swift`), placed there by the auth-sync
  bridge whenever the main app signs in.
- **POSTs directly to the API**:
  `POST /api/graphs/{graphId}/links/async` with url, title, description,
  and highlights (the selection). Link enrichment then happens through
  V1's server-side operations pipeline, and the client later applies the
  resulting link note; the daily note gets its `[[Links]]` entry.
- **UI states**: loading → "Saved to Reflect!"; "Please sign in using
  Reflect app" when tokens are missing; a capture-failure state; and a
  dedicated "sharing text highlights doesn't work from this app" tip
  state.
- **Errors are queued, not lost**: failures append to
  `ReflectDefaults.extensionErrors` and are reported to Sentry the next
  time the main app foregrounds.

## What changes in v2, and why

There is no API to POST to — the design inverts from *send to server* to
*write locally, ingest on launch*:

- **The extension writes a capture envelope into an App Group inbox**
  (the same envelope model as the shipped desktop Chrome capture,
  Plan 11: URL, title, selection/highlights, provenance, captured-at).
  Extensions must **not** open the Git repo or SQLite — the inbox is the
  only contract.
- **The main app ingests on next launch/foreground**: envelope → markdown
  (a `[[Links]]` entry on the capture-day daily note, and a link note for
  richer captures), then indexes and syncs like any local write, through
  the in-process file-change seam.
- **AI enrichment (description) happens at ingest, BYOK, in the app** —
  never in the extension, which must hold no provider keys. If the
  capture or target note is `private: true`, enrichment is skipped and
  the raw link is still saved: privacy is enforced at the inbox boundary.
- **Auth state disappears** from the flow entirely — no tokens, no
  graph-ID handoff, no signed-out state. The extension's failure modes
  shrink to "no graph yet" and disk errors.
- The two-tap UX, in-page metadata extraction (title/selection/
  description), and the queued-errors-surface-later pattern port as
  requirements.

## V1 → v2 mapping

| V1                                            | v2                                                            |
| --------------------------------------------- | -------------------------------------------------------------- |
| POST `/links/async` with App Group tokens     | Capture envelope into the App Group inbox                      |
| Server-side enrichment via operations         | BYOK enrichment at ingest, in-app, privacy-checked              |
| "Please sign in" state                        | Gone (no accounts); "set up a graph first" at most              |
| `ExtensionClass.js` metadata extraction       | Port: same fields into the envelope                             |
| Errors queued in App Group defaults           | Same pattern: queue in the container, surface in-app            |
| Daily-note `[[Links]]` entry (applied later)  | Same product shape, written locally at ingest                   |

## Resolved decisions

- **One envelope schema, two producers**: the extension mirrors
  `capture-envelope.ts` (`LinkCaptureEnvelope`/`TextCaptureEnvelope` in
  `CaptureInbox.swift`); provenance is the widened `source: 'ios-share'`
  member, never a new envelope variant. Safari's in-page description rides
  the new optional `metaDescription` field, which the drain writes into the
  raw save and enrichment replaces in place.
- **App Group provisioned with this wave**: `group.app.reflect` on both
  targets; the extension writes `<uuid>.json` atomically (tmp + same-volume
  rename), the app-side Rust relay moves committed `.json` files into the
  graph inbox (copy + atomic write + delete — the containers are different
  volumes), quarantining oversized files beside the shared inbox.
- **Ingest is foreground-only** (v1 posture, like sync): graph open, window
  focus/online, and `visibilitychange` → visible all schedule the
  relay+drain pass; no background refresh task.
- **Entitlements are hand-maintained per flavor** (superseding the earlier
  spec-driven `entitlements.properties` approach): each target commits a
  release `.entitlements` and a dev `.dev.entitlements`, and
  `ios.project.yml` selects one per configuration via
  `CODE_SIGN_ENTITLEMENTS`. There is no xcodegen `entitlements:` block, so
  regens (including `tauri ios init`) do not touch the files at all; the old
  wipe-to-empty-dict failure mode cannot recur, and the dev flavor
  (`app.reflect.ios.dev`, `group.app.reflect.dev`) gets its own capability
  set.
- **CI signing must preserve the App Group.** Tauri's App Store Connect
  API-key flow (the TestFlight workflow) archives with signing disabled and
  dummy-signs only the app binary before export; `xcodebuild -exportArchive`
  preserves only entitlements already present in a signature, so the appex
  used to ship without the App Group — the container lookup returned nil
  and every share failed with "Couldn't save" (local builds were fine
  because Xcode signs during archive). A post-build phase on the
  ShareExtension target ad-hoc signs the appex with its entitlements when
  `CODE_SIGNING_ALLOWED=NO`, and `release-ios.mjs` refuses to accept or
  upload an IPA whose appex lacks `group.app.reflect`.
