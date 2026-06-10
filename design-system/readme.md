# Reflect Design System

> **Reflect** — *"A beautifully minimalist note-taking app designed to mirror the way you think."*
> Think better with Reflect. Never miss a note, idea or connection.

This is a design system distilled from Reflect's real production source. Use it to
build well-branded Reflect interfaces and assets — product screens, marketing pages,
slides, prototypes — that look and feel like the real thing.

---

## What Reflect is

Reflect is a fast, minimalist, **networked** note-taking app. It is a writing tool
first: the interface gets out of the way so your prose is the hero. Its defining
ideas are:

- **Daily notes** — an infinite, date-stamped journal is the home surface.
- **Networked thought / backlinks** — `[[wiki-style]]` links between notes form a
  graph (a "second brain"). The brand mark *is* that graph.
- **Frictionless capture** — fast sync, instant search (`⌘K`), audio notes, web
  clipper, Kindle highlights.
- **A native AI assistant** — GPT-4 + Whisper for transcription, outlining, rewriting,
  and acting as a "thought partner."
- **Privacy** — end-to-end encrypted. "No one else can read them (not even us)."
- **Everywhere** — Mac, Windows, iOS, web; online or offline; real-time synced.

Pricing is famously simple: **one plan, one price — $10/month** (billed annually),
with a 14-day free trial.

It is an **indie product** (Reflect App, LLC; founder Alex MacCaw / @maccaw), with a
warm, slightly playful voice — *"making a jolly good note-taking app."*

### Two surfaces, one purple soul
Reflect presents two distinct visual worlds that share a brand color:

1. **The App** — a calm, near-white (or deep-navy dark-mode) productivity canvas.
   Dense, quiet chrome; **indigo `#4F46E5`** as the only saturated accent; everything
   else cool grey. Built on a shadcn-style HSL token set.
2. **The Marketing Site** — a near-black *"deep space"* surface (`#030014`) lit by
   **purple radial glows** (`#712fff` / `#9465ff`), glassmorphic hairline borders, and
   oversized tight display type.

---

## Sources

This system was reverse-engineered from materials the user supplied. The reader may
not have access, but they are recorded here for provenance and deeper study:

- **GitHub — `team-reflect/reflect`** (private): https://github.com/team-reflect/reflect
  - `styles/tailwind.css` — the shadcn/HSL design-token root (brand, background, muted,
    border, radius for light + `.dark`).
  - `components/button/*` — the real button variants (primary/secondary/white/text/alt).
  - `client/screens/main/*` — the app shell: `notes-sidebar`, `note-edit`, `notes-daily`.
  - `site/shared/*` — the marketing layout, nav capsule, and glassmorphic gradient button.
  - `pages/fonts/Inter-4.0/web/*` — Inter Variable (the only typeface).
  - `public/site/icons/*`, `site/shared/logo.png` — the graph app icon & logos.
- **Live site** — https://reflect.app (marketing copy, feature list, pricing, testimonials).
- **Academy / docs** — https://reflect.academy

> Explore the `team-reflect/reflect` repository further to build with higher fidelity —
> the editor (`@team-reflect/reflect-editor`), preferences, and AI surfaces are deeper
> than what is reproduced here.

---

## CONTENT FUNDAMENTALS

**Voice — confident, calm, quietly clever.** Reflect speaks like a thoughtful maker,
not a marketing department. Sentences are short and declarative. There's dry wit
("making a jolly good note-taking app"; encryption "not even us") but never goofiness.

- **Person:** Speaks to **"you"** and **"your"** ("Give *your* brain superpowers",
  "Mirror the way *your* mind works"). The team is **"we / our"** ("We're everywhere",
  "Our mission is to improve the way people think").
- **Casing:** **Sentence case everywhere** — headings, buttons, menu items, labels.
  Never Title Case UI, never ALL CAPS (except tiny tracked section eyebrows like
  "Reflect AI", "Encryption", "Meetings" that label a marketing section).
- **Headlines** are aspirational and benefit-led, often imperative:
  *"Think better with Reflect."* · *"Give your brain superpowers."* ·
  *"Never lose information."* · *"Get more out of your meetings."*
- **Feature blurbs** are one tight line, lowercase-feeling, no period sometimes:
  *"Instantly sync your notes across devices"* · *"Form a graph of ideas with backlinked
  notes"* · *"Capture ideas on the go, online or offline."*
- **App chrome copy** is terse and literal: `Daily notes`, `All notes`, `Tasks`, `Map`,
  `Pinned notes`, `Search anything…`, `Preferences`, `Billing`, `Sign out`,
  `My Graph`. Placeholders use an ellipsis ("Search anything…", "Ask anything to AI…").
- **Buttons / CTAs:** verb-led and specific — `Start free trial`, `Start your 14-day
  trial`, `Take the course`, `See our values`, `Subscribe`. The recurring primary CTA
  is **"Start free trial" / "Start your 14-day trial."**
- **Emoji:** essentially **none** in product UI and almost none in marketing (a rare 🙏
  shows up only inside quoted user testimonials — never in Reflect's own voice).
- **Numbers/jargon:** minimal. Reflect avoids stat-slop; it names benefits ("Built for
  speed", "Frictionless search") rather than dumping metrics.
- **Vibe:** *minimalist, fast, trustworthy, a little magical.* Users describe it as
  "magic" and praise "the simplicity… is beautiful" — lean into calm restraint.

---

## VISUAL FOUNDATIONS

**Typeface.** One family: **Inter** (the variable "Inter 4.0" cut). Nothing else.
`--weight-medium (500)` is the workhorse for nav, buttons, titles and note titles;
body/editor prose is 400. Headings use **tight negative tracking** (`-0.02em`);
default UI uses Inter's slight optical setting (`-0.011em`).

**Type scale.** The app is a *writing tool*, so chrome text is deliberately **small**
(12–14px: note titles & shortcuts at `2xs/12px`, buttons & menu items at `sm/14px`),
and the user's prose is the largest thing on screen (16px+). The marketing site
inverts this with huge tight display headings (`40–72px`).

**Color.**
- **App:** near-white canvas (`#fff` surfaces on a `#f8fafa` app bg) or deep-navy dark
  mode (`hsl(224 49% 8%)` ≈ `#0a0f1e`). Neutrals are **cool greys** (the "coolgray"
  ramp). **Indigo `#4F46E5` is the only saturated accent** — solid buttons, selected
  state, focus. Secondary actions use soft indigo (`#e0e7ff` bg / `#4338ca` text).
  Destructive is red-500. That's the whole palette — restraint is the point.
- **Site:** near-black `#030014` lit by **purple** — a soft radial glow
  (`rgba(148,101,255,.08)`) from top-center, `#712fff`/`#9465ff` accents, and hairline
  glass borders in `rgba(255,255,255,.08)`.

**Backgrounds.** App = flat solid fills, no gradients, no texture, no imagery behind
content. Site = the deep-space radial-glow gradient + glassmorphism (translucent fills
with `backdrop-blur`). The signature brand image is the **networked graph sphere**
(glowing purple nodes connected by arcs) — used as the app icon and hero motif. No
stock photography; product screenshots and the graph illustration carry imagery.

**Borders & dividers.** Hairlines do most of the structural work — `1px` borders in
`--coolgray-200`, and the signature **`shadow-border-b` / `shadow-border-r`**
(`0 1px 0 rgba(11,19,36,.05)`) for crisp 1px separators that don't add weight. Inputs
get a `rgba(11,19,36,.15)` outline. In dark/space mode, borders drop to
`rgba(255,255,255,.05–.08)`.

**Corner radii.** Gentle. Controls & cards = **8px** (`--radius-lg`, the house value);
the search field is a precise **7px**; tags/chips 4px; modals & glass panels 12–16px;
avatars, the graph color dot, and the marketing nav capsule are **fully round**.

**Shadows / elevation.** The app is **mostly flat** — borders carry hierarchy and
shadows appear only on *floating* things: inputs (`0 1px 2px rgba(0,0,0,.05)`),
popovers/menus, modals (`--shadow-pop`). The marketing buttons use an **inset purple
glow** (`inset 0 0 12px rgba(191,151,255,.24)`) rather than a drop shadow.

**Hover / press states.**
- *Menu items & list rows:* hover = a translucent grey wash (`bg-gray-200/50`, i.e.
  `rgba(229,231,235,.5)`; dark: `rgba(255,255,255,.04)`). Selected = same wash + the
  text shifts to `--text` (darker).
- *Primary button:* hover **lightens** indigo-600 → indigo-500; focus = 2px indigo ring
  with offset; disabled = grey + `not-allowed`.
- *Touchable (mobile/list):* `active:opacity-70` — a quick opacity dip on press.
- *Site links:* color fade over `300ms` with the house easing.
- *White button:* hover shifts text → purple-500.

**Motion.** Short and calm — **no bounces, no spring.** Most UI transitions are
`100–150ms`. The site's signature easing is **`cubic-bezier(.6,.6,0,1)`** (a fast-out
curve) for color/opacity over `~300ms`. Reflect favors fades and subtle washes over
movement.

**Transparency & blur.** Used intentionally: glassmorphic chrome on the marketing site
(`backdrop-blur(16px)` headers, translucent nav capsule), and translucent hover/border
washes in the app dark mode. Not used decoratively in the light app.

**Layout rules.** App = a fixed-width left **sidebar (~260px)** on a sunken
(`coolgray-50`) surface + a flexible main editor column with a comfortable prose
measure (`max-w` ~46rem, optionally centered "semi-screen"). On desktop/Electron the
sidebar top-pads for the traffic-light window controls and is drag-region. Site =
centered `1296px` max container with generous `~96px` vertical section rhythm.

**Imagery vibe.** Cool and purple-leaning. The hero graph glows; product shots sit on
the dark space canvas. No warm tones, no grain, no photography of people (except small
circular testimonial avatars).

---

## ICONOGRAPHY

Reflect ships a small set of **hand-built single-path SVG icons** living in
`components/icons/*` (e.g. `search-icon`, `pencil-icon` → Daily notes, `list-icon`
→ All notes, `check-icon` → Tasks, `map-icon` → Map, `calendar`, `mic`, `pin`,
`link`/`un-link`, `history`, `trash`, `chevron-left/right`, `help`, light/dark-mode).
They are **thin-stroke, ~1.5–2px, line-style** icons sized to match 14px chrome text,
inheriting `currentColor`.

- **No icon font, no emoji, no unicode glyphs as icons.** Icons are inline SVG.
- They are functional and minimal — a search magnifier, a pencil, a checkmark — never
  decorative or multicolor.
- The **brand mark** is the networked-graph sphere (`assets/reflect-app-icon.png` /
  `reflect-graph-hero.png`): glowing white nodes connected by purple arcs.

**Substitution for this system:** rather than re-tracing Reflect's private SVGs, this
kit uses **[Lucide](https://lucide.dev)** (loaded from CDN) — a thin-stroke line set
that matches Reflect's weight and style almost exactly (`search`, `pencil`, `list`,
`check`, `map`, `calendar`, `mic`, `pin`, `link`, `trash`, `history`, chevrons all map
1:1). **⚠️ Flagged substitution** — swap in the real `components/icons` SVGs if you
need pixel-exact brand icons. Set `stroke-width: 1.75` to match.

---

## Index / manifest

**Root**
- `styles.css` — global entry point (link this); `@import`s every token + font file.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skill manifest for using this system in Claude Code.

**`tokens/`** — CSS custom properties (all reachable from `styles.css`)
- `fonts.css` — Inter Variable `@font-face`.
- `colors.css` — indigo & cool-grey ramps, marketing purples, semantic aliases;
  `.dark` and `.reflect-space` theme scopes.
- `typography.css` — families, type scale, weights, line-heights, tracking.
- `spacing.css` — 4px spacing scale, radii, shadows, layout widths, motion.

**`assets/`**
- `fonts/InterVariable.woff2`, `fonts/InterVariable-Italic.woff2`
- `reflect-app-icon.png` (rounded graph sphere), `reflect-app-icon-square.png`,
  `reflect-graph-hero.png` (graph-on-grid hero), `reflect-logo-mark.png`.

**`components/core/`** — reusable React primitives (see each `.prompt.md`):
Button, IconButton, Input, SearchField, Checkbox, Badge, Card, Avatar, MenuItem,
ShortcutKey, Toggle. *(populated below)*

> **Consuming this package:** `@reflect/design-system` exports **only**
> `styles.css`, `tokens/*`, and `assets/*` (see `package.json`). The `.jsx`
> components here are *spec artifacts* — reference implementations for fidelity,
> not importable modules. Product apps (e.g. `apps/desktop`) build their own
> primitives on the tokens; the desktop app additionally maps the tokens into
> Tailwind theme keys (`@theme inline` in its `styles/index.css`), so product
> code writes `text-text-muted` / `bg-surface-hover` instead of raw `var(--…)`
> escapes.

**`guidelines/`** — foundation specimen cards (Design System tab).

**`ui_kits/`**
- `app/` — the Reflect notes app (sidebar + daily notes + editor + ⌘K search).
- `marketing/` — the deep-space marketing homepage.

See `SKILL.md` for how to use this as a downloadable Agent Skill.
