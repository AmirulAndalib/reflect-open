# Porting the share extension

**v2 status: later wave.** Deferred until the mobile share target can
reuse the Plan 11 capture envelope/inbox model (desktop Chrome capture has
shipped; the App Group ingestion half is the open work). V1's extension is
the behavioral spec: save a link from any app in two taps, working even
when the main app isn't running.

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

## Open questions

- Envelope schema versioning shared between the desktop capture path and
  the iOS extension (one format, two producers).
- When to provision the extension target + App Group in
  `ios.project.yml` (with the audio wave, most likely — same container).
- Whether ingest should run on a background refresh or strictly on
  foreground (v1 posture: foreground-only, like sync).
