import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutocompleteKeyboardFit } from './use-autocomplete-keyboard-fit'

/**
 * Geometry harness: jsdom has no layout, so the popup's rect is scripted.
 * `window.innerHeight` is jsdom's default 768; heights respond to the
 * `max-height` the hook writes, like a real flexbox popup would.
 */
function installPopup(rect: { top: number; height: number }): HTMLElement {
  const popup = document.createElement('prosekit-autocomplete-popup')
  popup.getBoundingClientRect = () => {
    const capped = Number.parseFloat(popup.style.maxHeight)
    const height = Number.isFinite(capped) ? Math.min(rect.height, capped) : rect.height
    return {
      top: rect.top,
      bottom: rect.top + height,
      height,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    } as DOMRect
  }
  document.body.appendChild(popup)
  return popup
}

function setKeyboardHeight(height: number): void {
  document.documentElement.style.setProperty('--keyboard-height', `${height}px`)
}

beforeEach(() => {
  setKeyboardHeight(0)
})

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.style.removeProperty('--keyboard-height')
})

describe('useAutocompleteKeyboardFit', () => {
  it('leaves popups alone while the keyboard is down', () => {
    const popup = installPopup({ top: 600, height: 200 })
    const view = renderHook(() => useAutocompleteKeyboardFit())
    expect(popup.style.maxHeight).toBe('')
    expect(popup.style.transform).toBe('')
    view.unmount()
  })

  it('leaves a popup alone when it already ends above the keyboard', () => {
    const popup = installPopup({ top: 100, height: 200 })
    setKeyboardHeight(300) // visible area ends at 468
    const view = renderHook(() => useAutocompleteKeyboardFit())
    expect(popup.style.maxHeight).toBe('')
    expect(popup.style.transform).toBe('')
    view.unmount()
  })

  it('caps the height when the popup would run under the keyboard', () => {
    const popup = installPopup({ top: 200, height: 288 })
    setKeyboardHeight(300) // limit 468; spaceBelow = 468 - 8 - 200 = 260
    const view = renderHook(() => useAutocompleteKeyboardFit())
    expect(popup.style.maxHeight).toBe('260px')
    expect(popup.style.transform).toBe('')
    view.unmount()
  })

  it('flips above the caret when the keyboard leaves no room below', () => {
    // Typing on the last visible line: caret just above the keyboard.
    const popup = installPopup({ top: 420, height: 200 })
    setKeyboardHeight(300) // spaceBelow = 40 < 160 → flip
    const view = renderHook(() => useAutocompleteKeyboardFit())
    // Estimated caretTop = 420-8-24 = 388; spaceAbove = 388-16 = 372;
    // height stays 200; popup bottom lands at 388-8 = 380 → 380-620 = -240.
    expect(popup.style.maxHeight).toBe('372px')
    expect(popup.style.transform).toBe('translateY(-240px)')
    view.unmount()
  })

  it('measures the caret from the live selection when it has a rect', () => {
    const popup = installPopup({ top: 420, height: 200 })
    setKeyboardHeight(300)
    const getSelection = vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: 1,
      getRangeAt: () => ({
        getBoundingClientRect: () => ({ top: 400, height: 20 }),
      }),
    } as unknown as Selection)
    const view = renderHook(() => useAutocompleteKeyboardFit())
    // caretTop = 400 (real); spaceAbove = 384; bottom lands at 392 → 392-620.
    expect(popup.style.maxHeight).toBe('384px')
    expect(popup.style.transform).toBe('translateY(-228px)')
    getSelection.mockRestore()
    view.unmount()
  })

  it('stays below (capped) when there is even less room above the caret', () => {
    // Caret near the screen top with a huge keyboard: above is worse.
    const popup = installPopup({ top: 100, height: 200 })
    setKeyboardHeight(600) // limit 168; spaceBelow = 60; spaceAbove = 52
    const view = renderHook(() => useAutocompleteKeyboardFit())
    expect(popup.style.maxHeight).toBe('60px')
    expect(popup.style.transform).toBe('')
    view.unmount()
  })

  it('refits when the keyboard height changes, and resets on dismiss', async () => {
    const popup = installPopup({ top: 200, height: 288 })
    const view = renderHook(() => useAutocompleteKeyboardFit())
    setKeyboardHeight(300)
    await waitFor(() => expect(popup.style.maxHeight).toBe('260px'))
    setKeyboardHeight(0)
    await waitFor(() => expect(popup.style.maxHeight).toBe(''))
    expect(popup.style.transform).toBe('')
    view.unmount()
  })

  it('skips a closed (zero-height) popup', () => {
    const popup = installPopup({ top: 300, height: 0 })
    setKeyboardHeight(300)
    const view = renderHook(() => useAutocompleteKeyboardFit())
    expect(popup.style.maxHeight).toBe('')
    view.unmount()
  })
})
