# Porting search and All Notes

**v2 status: shipped for the list + lexical search + filter badges (the
All tab, `apps/desktop/src/mobile/screens/all-notes.tsx`, with the badge
row in `apps/desktop/src/mobile/search-filters/`); the AI search chat is
a later wave (with the copilot).**

## What V1 mobile does

Implementation: `client/screens/notes-list/` (list, search bar, filters,
AI chat), `services/search/` (shared search stack).

### The list

- A virtualized list (react-virtuoso) of notes: title + first content
  line + relative timestamp ("2 days ago"). Rows are fixed-height (68 px)
  so placeholder resolution never causes jumps.
- Default order: pinned first (`pinnedIndex ASC NULLS LAST`), then most
  recently edited.
- Tap → note detail (`/:graph/all/:id`); tag taps from the editor land
  here as a filtered list (`/:graph/all/tag/:tag`) with a back button.
- Empty state, pull-to-refresh, double-tap-tab scroll-to-top.

### Search

- An `IonSearchbar` ("Search anything…") with a 300 ms debounce and a
  3-character minimum (shorter queries show a validation hint).
- **Local FTS5 only**: unicode61 tokenizer, BM25 with ~3× subject
  weighting, then re-ranked by recency, pinned status, and exact-subject
  match — the same ranking logic as desktop V1. The trigram extension is
  disabled on mobile, and the vector table (`notesVec`) exists in the
  schema but is unused: **V1 mobile shipped without semantic search and
  it was not missed**.
- Typing `#` switches to tag search (fuzzy tag matching); selecting a tag
  filters the list.

### Filter badges

A horizontally scrollable badge row under the search bar
(`client/screens/notes-list/search-filter/search-filter-bar.tsx`):

- **Pinned** and **Published** toggles.
- **Tags** (multi-select modal picker).
- **Linked to** / **Linked by** a chosen note (note-picker modals).
- **Created at** / **Updated at** (relative presets + custom range
  pickers) and a **Daily notes** filter.
- Filters AND together; a **Reset** button animates in when any are
  active.

### AI search chat

From the search bar, a chat icon opens `/:graph/all/ai-chat` — a chat
**grounded in the current search results** (the same "chat over an
explicit retrieval set" model as desktop V1, as its own page rather than
a modal toggle). Streaming answers, inline citations linking to source
notes, stop/cancel while streaming, and a provider disclosure in the UI.
View model shared with the notes-list code
(`client/screens/notes-list/ai-chat/`, `client/screens/ai-chat-page/`).

## What changes in v2, and why

- **Same search shape, different substrate.** The All tab embeds search
  over the existing FTS5 getters — the same index schema and ranking as
  desktop v2, over the rebuildable `.reflect/` projection. Nothing
  Firestore-shaped survives.
- **Semantic search stays off mobile** per the indexing strategy
  (`fastembed`/ORT is desktop-only). V1's experience is the supporting
  data point: lexical-first is a proven mobile scope.
- **Filter badges are V1-parity work** called for by Plan 19 ("embedded
  search and filter badges"). The v2 vocabulary differs where V1 concepts
  died: *Published* has no v2 meaning (publishing is deferred
  product-wide); *Created at* has no v2 substrate — the index projects no
  creation time, markdown carries none, and file birthtimes don't survive
  Git/iCloud sync, so a created filter would rank on garbage. *Pinned*,
  *Tags*, *Daily*, and *Updated at* map onto existing index columns;
  *Linked to/by* maps onto the backlink projection.
- **AI chat is deferred to the copilot wave.** When it arrives it should
  be the v2 chat engine (BYOK, CloudSafe/`private: true` enforcement)
  grounded in search results — V1's retrieval-set grounding is the
  interaction model worth keeping, and V1's visible provider disclosure
  is already v2 policy.
- Minimum-length and debounce details are free to differ (desktop v2
  search behavior wins), but fixed-height rows and virtualization are
  load-bearing on mobile and already the v2 approach.

## V1 → v2 mapping

| V1                                             | v2                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| FTS5 BM25, 3× subject, recency/pinned/exact    | Same-index FTS5 getters as desktop v2                           |
| Vector search stubbed out                      | Explicitly out (indexing strategy); lexical-first               |
| Filter badges incl. Published, Created at      | V1-parity badges minus Published/Created; backlink + updated    |
| `#` tag search mode                            | Tag filtering per desktop tag parity                            |
| Virtuoso, fixed 68 px rows                     | Virtualized list (same technique)                               |
| Search-grounded AI chat page (server AI)       | Later wave: copilot/chat engine, BYOK, `private: true` blocked  |
| Pull-to-refresh                                | Optional; index updates arrive via the in-process write seam    |
