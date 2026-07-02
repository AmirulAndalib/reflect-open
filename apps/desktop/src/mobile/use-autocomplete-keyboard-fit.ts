import { useEffect } from 'react'

/**
 * Keeps the editor's autocomplete popups (the `[[` wiki-link, `#` tag, and
 * `/` slash menus) inside the visual viewport while the software keyboard is
 * up (Plan 19). The keyboard plugin deliberately leaves the webview at its
 * full-screen frame, so floating-ui positions the menus against a layout
 * viewport that extends *under* the keyboard: a menu opened below the caret
 * can be mostly (or entirely) occluded, and its entries untappable.
 *
 * The fix reads `--keyboard-height` (the plugin's authoritative overlap) and
 * adjusts each open popup:
 *
 * - enough room below the caret → cap `max-height` so the menu ends above the
 *   keyboard;
 * - cramped below (the common case: typing on the note's last line, caret
 *   just above the keyboard) → flip the menu above the caret line via a
 *   `translateY`, the flip floating-ui would have done had it known the real
 *   viewport.
 *
 * Everything is driven by one MutationObserver on the document root: menu
 * open/close and item changes are childList mutations, keyboard height
 * changes are a style-attribute mutation on `<html>` (`useKeyboardHeightVar`
 * writes the CSS variable there). Writes are skip-if-unchanged so the
 * observer can watch its own effects without looping.
 */
export function useAutocompleteKeyboardFit(): void {
  useEffect(() => {
    const fitAll = (): void => {
      const keyboard = keyboardHeightPx()
      for (const popup of document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)) {
        fitPopup(popup, keyboard)
      }
    }
    // Fitting resets styles to measure the natural geometry, so every pass
    // mutates the popup even at a fixpoint — discard the records our own
    // writes queued or the observer would re-fire forever.
    const observer = new MutationObserver(() => {
      fitAll()
      observer.takeRecords()
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-state'],
    })
    fitAll()
    return () => observer.disconnect()
  }, [])
}

/** ProseKit renders every autocomplete menu as this custom element. */
const POPUP_SELECTOR = 'prosekit-autocomplete-popup'

/** Breathing room between the menu and the keyboard / screen edges. */
const GAP_PX = 8

/** The positioner anchors the popup this far below the caret's bottom. */
const ANCHOR_OFFSET_PX = 8

/** Estimated caret line height — only used to clear the line when flipping. */
const CARET_LINE_PX = 24

/** Below-caret space under this flips the menu above the caret instead. */
const MIN_BELOW_PX = 160

function keyboardHeightPx(): number {
  const raw = document.documentElement.style.getPropertyValue('--keyboard-height')
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function fitPopup(popup: HTMLElement, keyboard: number): void {
  if (keyboard <= 0) {
    resetPopup(popup)
    return
  }
  // Measure the popup at its natural (unflipped, uncapped) geometry so the
  // math is stable across refits; the anchored top never moves under us.
  resetPopup(popup)
  const rect = popup.getBoundingClientRect()
  if (rect.height === 0) {
    return // closed (or not yet laid out) — nothing to fit
  }
  const limit = window.innerHeight - keyboard
  const spaceBelow = limit - GAP_PX - rect.top
  if (rect.bottom <= limit - GAP_PX) {
    return // already fully visible
  }
  if (spaceBelow >= MIN_BELOW_PX) {
    setStyle(popup, 'max-height', `${Math.floor(spaceBelow)}px`)
    return
  }
  // Flip above the caret line: the popup's anchored top sits ANCHOR_OFFSET
  // below the caret's bottom, so the caret's top is one line above that.
  const caretTop = rect.top - ANCHOR_OFFSET_PX - CARET_LINE_PX
  const spaceAbove = caretTop - ANCHOR_OFFSET_PX - GAP_PX
  if (spaceAbove <= spaceBelow) {
    // No better above (caret near the screen top): keep it below, capped to
    // whatever room there is rather than hiding entries under the keyboard.
    setStyle(popup, 'max-height', `${Math.max(Math.floor(spaceBelow), 0)}px`)
    return
  }
  setStyle(popup, 'max-height', `${Math.floor(spaceAbove)}px`)
  // Re-measure after the cap: the flip distance depends on the final height.
  const height = popup.getBoundingClientRect().height
  const shift = height + CARET_LINE_PX + 2 * ANCHOR_OFFSET_PX
  setStyle(popup, 'transform', `translateY(${-Math.round(shift)}px)`)
}

function resetPopup(popup: HTMLElement): void {
  setStyle(popup, 'max-height', '')
  setStyle(popup, 'transform', '')
}

/** Write-if-changed, so the MutationObserver never loops on its own writes. */
function setStyle(popup: HTMLElement, property: string, value: string): void {
  if (popup.style.getPropertyValue(property) !== value) {
    if (value === '') {
      popup.style.removeProperty(property)
    } else {
      popup.style.setProperty(property, value)
    }
  }
}
