# Porting audio memos (mobile)

**v2 status: later wave — the first post-release wave per the product
owner.** Desktop v2 audio memos have shipped (raw-first recording into the
graph + async BYOK transcription — see the desktop
[audio-memos porting doc](../audio-memos.md)); the mobile wave reuses that
pipeline. V1's server-upload design is forbidden in v2, but V1's
*reliability engineering* is the bar to meet. This is the most engineered
feature in V1 mobile and the clearest expression of its design philosophy:
**critical capture must not depend on the webview being alive.**

## What V1 mobile does

### Entry points

In-app record button (FAB), lock-screen widget (via `reflect-widget://`),
Live Activity / Dynamic Island with a stop button (iOS 17+ `StopRecording`
App Intent), Siri ("Start recording in Reflect"), and a home-screen quick
action. OS-triggered entry points go through the native-action handshake
(see [native-entry-points](./native-entry-points.md)) so they survive cold
starts and webview crashes.

### The native pipeline

`ios/App/App/Capacitor Plugins/RecordingPlugin/RecordingPlugin.swift`
(~600 lines):

1. `AVAudioRecorder` captures AAC mono 44.1 kHz (`.m4a`); the idle timer
   is disabled; a Live Activity shows the elapsed timer.
2. Audio metering streams at 10 Hz to the webview for the live waveform
   (`components/recording-modal/recording-modal.tsx` is presentation
   only).
3. **Interruptions** (calls, Siri, alarms) and **input-route changes**
   (headphones unplugged) stop the recording cleanly instead of
   corrupting it.
4. On stop, **Swift uploads the file directly to Firebase Storage** with
   metadata (`processAs: audioRecording-v2`, user/graph/note IDs,
   natively-stored auth token, plus transcription prefs: `initialPrompt`,
   `formatTranscript`, `language`) — no webview involved.
5. **Failures persist** in App Group defaults (`filesToUpload`) and retry
   with exponential backoff (2 s → 5 min); `NWPathMonitor` retries when
   the network returns; `beginBackgroundTask` buys upload time after
   backgrounding. Pending uploads survive app restarts.
6. The V1 backend transcribes and the transcript syncs into the daily
   note through the normal note-sync pipeline. The user sees "Uploading
   and processing your audio memo"; a recordings count shows in the
   profile.

Transcription preferences (language, formatting, prompt hints) are pushed
reactively from the webview preference store into the native plugin.
Push-notification permission is requested at record time (processing
notifications).

## What changes in v2, and why

V1's reliability came from a server that received the payload. v2 has no
server, so the design inverts to local-first:

- **Raw-first is the durable artifact.** Recordings land in the graph
  (desktop: `audio-memos/`, max 10 min, saved immediately) and sync like
  any file. Transcription is a separate, retryable step — losing it never
  loses audio. This is already the shipped desktop decision; mobile
  reuses it.
- **Recording still needs a native layer.** The V1 lesson stands: capture
  from the lock screen / Siri / a dying webview requires native recording
  code and (for extension-initiated capture) an **App Group inbox** the
  main app ingests from on next launch — extensions must not touch the
  Git repo or SQLite directly. Interruption/route-change handling and
  persisted pending state port as requirements, with the App Group
  container replacing Firebase Storage as the can't-lose buffer.
- **Transcription is BYOK cloud** (OpenAI/Gemini keys from the iOS
  keychain via the same secrets module), run by the app's transcription
  reconciler, with explicit privacy UX. `private: true` is enforced at
  the transcript-insertion boundary and at the inbox boundary.
- **OS entry points ship with this wave** (widget, Siri, Live Activity,
  quick action) — they are most of mobile audio's value and require
  native targets + App Group provisioning regardless of shell.
- Waveform metering → webview events ports naturally (the plugin streams
  events like the keyboard plugin does).

## V1 → v2 mapping

| V1                                              | v2                                                            |
| ----------------------------------------------- | -------------------------------------------------------------- |
| Swift upload → Firebase Storage → server        | Raw `.m4a` into the graph (App Group inbox if app is dead)     |
| Server transcription → synced into daily note   | Async BYOK transcription reconciler → daily note               |
| Pending uploads in App Group defaults + backoff | Pending ingest in the App Group inbox; ingest on launch        |
| Transcription prefs pushed to native plugin     | Prefs in settings; reconciler reads them                       |
| Live Activity + widget + Siri + quick action    | Same targets, rebuilt beside the Tauri shell                   |
| Push notification on processing complete        | Dropped (no server); in-app status instead                     |
| Interruption/route-change safe stop             | Port as a requirement of the native recorder                   |

## Open questions (tracked in the grounding brief)

- The App Group + capture-inbox schema (file layout, ingest semantics,
  `private: true` at the boundary) and when to provision the App Group +
  extension targets in `ios.project.yml` — cheap early, annoying to
  retrofit, not needed for mobile v1.
- Whether long recordings need chunked ingest to respect memory limits in
  the extension context.
