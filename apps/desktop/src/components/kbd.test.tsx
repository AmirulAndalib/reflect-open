import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Kbd } from './kbd'

describe('Kbd', () => {
  it('renders its children inside a kbd element', () => {
    const view = render(<Kbd>esc</Kbd>)
    const keycap = view.getByText('esc')
    expect(keycap.tagName).toBe('KBD')
    view.unmount()
  })

  it('merges a custom className with the base cap styles', () => {
    const view = render(<Kbd className="custom-cap">K</Kbd>)
    const keycap = view.getByText('K')
    expect(keycap.className).toContain('custom-cap')
    expect(keycap.className).toContain('inline-flex')
    view.unmount()
  })
})
