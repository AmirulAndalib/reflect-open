import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AssetDescriptionsField } from './asset-descriptions-field'
import { useAssetDescriptions } from '@/providers/asset-description-provider'

vi.mock('@/providers/asset-description-provider', () => ({
  useAssetDescriptions: vi.fn(),
}))

const useAssetDescriptionsMock = vi.mocked(useAssetDescriptions)

function state(overrides: Partial<ReturnType<typeof useAssetDescriptions>> = {}) {
  return {
    available: true,
    backfill: vi.fn().mockResolvedValue(undefined),
    backfilling: false,
    running: false,
    progress: null,
    lastResult: null,
    error: null,
    ...overrides,
  }
}

describe('AssetDescriptionsField', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useAssetDescriptionsMock.mockReturnValue(state())
  })

  it('runs the explicit backfill action from Settings', () => {
    const backfill = vi.fn().mockResolvedValue(undefined)
    useAssetDescriptionsMock.mockReturnValue(state({ backfill }))

    render(<AssetDescriptionsField />)
    fireEvent.click(screen.getByRole('button', { name: 'Describe existing assets' }))

    expect(backfill).toHaveBeenCalledTimes(1)
  })

  it('disables the action when no provider is configured', () => {
    useAssetDescriptionsMock.mockReturnValue(state({ available: false }))

    render(<AssetDescriptionsField />)

    const button = screen.getByRole('button', { name: 'Describe existing assets' })
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Add an AI provider before describing assets.')).toBeTruthy()
  })

  it('shows progress while backfilling', () => {
    useAssetDescriptionsMock.mockReturnValue(
      state({ backfilling: true, progress: { done: 2, total: 5, path: 'assets/doc.pdf' } }),
    )

    render(<AssetDescriptionsField />)

    const button = screen.getByRole('button', { name: 'Describing assets...' })
    expect(button).toBeInstanceOf(HTMLButtonElement)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('2 of 5 - assets/doc.pdf')).toBeTruthy()
  })
})
