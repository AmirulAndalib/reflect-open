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
 *   just above the keyboard) → flip the menu above the caret via a
 *   `translateY`, the flip floating-ui would have done had it known the real
 *   viewport. The caret is measured from the live selection; when no rect is
 *   available the anchor offset meowdown uses is estimated instead.
 *
 * Everything is driven by one MutationObserver on the document root: menu
 * open/close and item changes are childList mutations, keyboard height
 * changes are a style-attribute mutation on `<html>` (`useKeyboardHeightVar`
 * writes the CSS variable there). Refits coalesce into one pass per animation
 * frame, and the records our own style writes queue are discarded so the
 * observer never loops on itself.
 */
export function useAutocompleteKeyboardFit(): void {
  useEffect(() => {
    const fitAll = (): void => {
      const keyboard = keyboardHeightPx()
      for (const popup of document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)) {
        fitPopup(popup, keyboard)
      }
    }
    let frame: number | null = null
    const observer = new MutationObserver(() => {
      if (frame !== null) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = null
        fitAll()
        observer.takeRecords()
      })
    })
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-state'],
    })
    fitAll()
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      observer.disconnect()
    }
  }, [])
}

/** ProseKit renders every autocomplete menu as this custom element. */
const POPUP_SELECTOR = 'prosekit-autocomplete-popup'

/** Breathing room between the menu and the keyboard / caret / screen edges. */
const GAP_PX = 8

/** The positioner anchors the popup this far below the caret's bottom. */
const ANCHOR_OFFSET_PX = 8

/** Caret line-height estimate for the no-selection-rect fallback. */
const CARET_LINE_FALLBACK_PX = 24

/** Below-caret space under this flips the menu above the caret instead. */
const MIN_BELOW_PX = 160

function keyboardHeightPx(): number {
  const raw = document.documentElement.style.getPropertyValue('--keyboard-height')
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The top of the caret line the popup is anchored to — from the live
 * selection when it has a box (real browsers give collapsed ranges a caret
 * rect), otherwise estimated back from the popup's anchored top.
 */
function caretTopPx(popupRect: DOMRect): number {
  const selection = window.getSelection()
  if (selection !== null && selection.rangeCount > 0) {
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    if (rect.height > 0) {
      return rect.top
    }
  }
  return popupRect.top - ANCHOR_OFFSET_PX - CARET_LINE_FALLBACK_PX
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
  if (rect.bottom <= limit - GAP_PX) {
    return // already fully visible
  }
  const caretTop = caretTopPx(rect)
  const spaceBelow = limit - GAP_PX - rect.top
  const spaceAbove = caretTop - 2 * GAP_PX
  if (spaceBelow >= MIN_BELOW_PX || spaceBelow >= spaceAbove) {
    // Enough room below (or no better above): keep it anchored, capped so it
    // ends above the keyboard rather than hiding entries under it.
    setStyle(popup, 'max-height', `${Math.max(Math.floor(spaceBelow), 0)}px`)
    return
  }
  // Flip above the caret line: cap to the room up there, then translate so
  // the popup's bottom lands just above the caret.
  setStyle(popup, 'max-height', `${Math.floor(spaceAbove)}px`)
  const height = popup.getBoundingClientRect().height
  const desiredBottom = caretTop - GAP_PX
  setStyle(popup, 'transform', `translateY(${Math.round(desiredBottom - (rect.top + height))}px)`)
}

function resetPopup(popup: HTMLElement): void {
  setStyle(popup, 'max-height', '')
  setStyle(popup, 'transform', '')
}

/** Write-if-changed, so converged refits queue no mutation records at all. */
function setStyle(popup: HTMLElement, property: string, value: string): void {
  if (popup.style.getPropertyValue(property) !== value) {
    if (value === '') {
      popup.style.removeProperty(property)
    } else {
      popup.style.setProperty(property, value)
    }
  }
}
