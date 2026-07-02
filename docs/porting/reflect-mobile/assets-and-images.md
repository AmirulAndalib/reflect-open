# Porting assets and images

**v2 status: replaced.** V1 mobile's encrypted asset pipeline exists to
serve encrypted cloud blobs offline; v2 assets are plain files under
`assets/` in the graph, so nearly all of the machinery dissolves. What
ports is the **experience contract** — images in notes load instantly and
work offline — plus the photo-insertion flow, which returns with the
editor-toolbar work.

## What V1 mobile does

- **Upload**: files are encrypted client-side
  (`@team-reflect/file-crypto` in a worker) and uploaded to the asset
  host. Editor insertion is optimistic: a temporary URL renders
  immediately, the confirmed upload follows (50 MB cap,
  `helpers/editor/editor-file-upload-handler.ts`).
- **Native cache**: encrypted blobs are also cached in
  `Library/Caches/AssetsCache` by the Assets plugin
  (`ios/App/App/Capacitor Plugins/AssetsPlugin/`). A
  `reserveUpload → addUpload → getUpload` bridge protocol coordinates the
  webview's crypto pipeline with the native cache and resolves races
  between concurrent uploads and downloads (`capacitor/assets.ts`).
- **Serving**: a custom `reflect-assets://` WKWebView scheme handler
  fetches the encrypted blob (with retries), **decrypts AES-GCM
  natively**, and returns the bytes to the webview — images in notes work
  offline and load fast.
- **Insertion**: the keyboard-toolbar image button opens the Capacitor
  Camera image picker (1000 px max width, 80 % quality, popover on iPad);
  picked photos round-trip through base64 into `editor.uploadImages()`.
- **Preview**: tapping an image opens a native full-screen viewer
  (Agrume) via the ImagePreview plugin.

## What changes in v2, and why

- **Assets are normal files** under `assets/` with relative markdown
  links, synced by git like everything else. No encryption, no asset
  host, no cache layer, no scheme-handler decryption — the file *is* the
  offline copy. Plan 19 step 7 already covers rendering: images resolve
  through the same asset protocol as desktop.
- **The race-coordination protocol has no equivalent** — there is one
  writer (the app) and one filesystem.
- **Photo insertion returns with editor/toolbar work**: an image picker →
  file in `assets/` → relative link at the caret, through the shared
  asset-write path (which emits its file-change batch like every local
  write). Down-scaling before write (V1's 1000 px/80 %) is worth keeping
  as a default on mobile — camera originals are huge, and graph size is
  sync cost.
- **Full-screen preview** becomes a webview-drawn lightbox when needed;
  no native viewer dependency.
- V1's 50 MB cap maps to the product-vision guardrail: large binaries get
  warnings/limits for GitHub-backed graphs.

## V1 → v2 mapping

| V1                                              | v2                                                          |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Encrypted upload to asset host                  | Plain file write into `assets/`                              |
| Native encrypted cache + `reflect-assets://`    | The file on disk, served via the asset protocol              |
| reserve/add/get upload race protocol            | Gone — one writer, one filesystem                            |
| Camera picker → base64 → upload pipeline        | Picker → downscale → `assets/` file → relative link          |
| Agrume native full-screen preview               | Webview lightbox, later                                      |
| 50 MB cap                                       | Large-binary sync guardrails (product vision)                |
