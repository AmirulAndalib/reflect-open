/**
 * Title → filename slug derivation (Plan 17). The slug is a *projection* of
 * the title — the only author of regular-note filenames in-app — so its output
 * must be safe on every filesystem a graph can sync to. Lowercase-only output
 * is load-bearing: it makes APFS/NTFS case-insensitivity and git
 * case-sensitivity agree by construction. Non-Latin scripts pass through
 * untransliterated; a CJK title keeps its characters.
 *
 * The rules are frozen by the golden corpus in `slug.test.ts`: a silent change
 * here would re-slug every title differently — a rename storm across graphs.
 */

/**
 * Windows reserved device names (case-insensitive, extension-less). A file
 * named `con.md` is uncreatable or hazardous on Windows, so these slugs get a
 * `-note` suffix.
 */
const WINDOWS_RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

/**
 * Maximum slug length in code points — a readability cap. Titles can be
 * sentences; a filename shouldn't be.
 */
const MAX_SLUG_CHARS = 80

/**
 * Maximum slug length in UTF-8 bytes — the safety cap. Filesystems budget
 * basenames in bytes (255 on APFS/ext4/NTFS), and `\p{L}` admits astral-plane
 * letters at 4 bytes each, so a code-point cap alone can overflow: 80 × 4 +
 * `.md` > 255. 200 leaves room for the extension and a collision suffix.
 */
const MAX_SLUG_BYTES = 200

/** Anything that isn't a letter, number, or separator is dropped outright. */
const STRIP_RE = /[^\p{L}\p{N}\s_-]+/gu
/** Separator runs (whitespace, `_`, `-`) collapse to a single `-`. */
const SEPARATOR_RE = /[\s_-]+/gu
const EDGE_DASHES_RE = /^-+|-+$/g

/** UTF-8 encoded size of one code point. */
function utf8Size(codePoint: number): number {
  if (codePoint <= 0x7f) {
    return 1
  }
  if (codePoint <= 0x7ff) {
    return 2
  }
  if (codePoint <= 0xffff) {
    return 3
  }
  return 4
}

/**
 * Cut `value` to at most {@link MAX_SLUG_CHARS} code points **and**
 * {@link MAX_SLUG_BYTES} UTF-8 bytes, always on a code-point boundary (never
 * splitting a surrogate pair).
 */
function capSlug(value: string): string {
  let chars = 0
  let bytes = 0
  let end = 0
  for (const char of value) {
    const codePoint = char.codePointAt(0)
    const size = codePoint === undefined ? 1 : utf8Size(codePoint)
    if (chars + 1 > MAX_SLUG_CHARS || bytes + size > MAX_SLUG_BYTES) {
      break
    }
    chars += 1
    bytes += size
    end += char.length
  }
  return value.slice(0, end)
}

/**
 * Derive the filename slug for a note title: NFC-normalize, lowercase
 * (Unicode-aware), drop everything but letters/numbers/separators, collapse
 * separator runs to single `-`, trim edge dashes, cap at
 * {@link MAX_SLUG_CHARS} code points and {@link MAX_SLUG_BYTES} UTF-8 bytes
 * on a code-point boundary. Never empty (`untitled`), never a Windows
 * reserved device name. Idempotent: a slug slugs to itself.
 */
export function slugForTitle(title: string): string {
  const folded = title.normalize('NFC').toLowerCase()
  const dashed = folded
    .replace(STRIP_RE, '')
    .replace(SEPARATOR_RE, '-')
    .replace(EDGE_DASHES_RE, '')
  // Cap, then re-trim: the cut can land right after a dash.
  const capped = capSlug(dashed).replace(EDGE_DASHES_RE, '')
  if (capped === '') {
    return 'untitled'
  }
  if (WINDOWS_RESERVED.has(capped)) {
    return `${capped}-note`
  }
  return capped
}
