import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineAlert } from './inline-alert'

describe('InlineAlert', () => {
  it('announces its content with role=alert', () => {
    const view = render(<InlineAlert>Save failed.</InlineAlert>)
    expect(view.getByRole('alert').textContent).toBe('Save failed.')
    view.unmount()
  })

  // TONE_CLASSES is the contract under test, so class substrings are asserted here.
  it('defaults to the warning (amber) tone', () => {
    const view = render(<InlineAlert>Heads up.</InlineAlert>)
    expect(view.getByRole('alert').className).toContain('amber')
    view.unmount()
  })

  it('renders the error tone in red', () => {
    const view = render(<InlineAlert tone="error">It broke.</InlineAlert>)
    const alert = view.getByRole('alert')
    expect(alert.textContent).toBe('It broke.')
    expect(alert.className).toContain('red')
    expect(alert.className).not.toContain('amber')
    view.unmount()
  })

  it('passes a custom className through', () => {
    const view = render(<InlineAlert className="mb-4">Spaced.</InlineAlert>)
    expect(view.getByRole('alert').className).toContain('mb-4')
    view.unmount()
  })
})
