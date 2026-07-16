import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeekRow } from './week-row'

const hapticImpactLight = vi.hoisted(() => vi.fn())

vi.mock('@/mobile/haptics', () => ({ hapticImpactLight }))

afterEach(() => {
  cleanup()
  hapticImpactLight.mockReset()
})

describe('WeekRow', () => {
  it('keeps a daily note marked when the date is both selected and today', async () => {
    const onSelect = vi.fn()
    const view = render(
      <WeekRow
        weekStart="2026-07-13"
        selectedDay="2026-07-16"
        todayDay="2026-07-16"
        notedDates={new Set(['2026-07-13', '2026-07-16'])}
        onSelect={onSelect}
      />,
    )

    const selected = view.getByRole('button', {
      name: 'Thursday, July 16th, has daily note',
    })
    expect(selected.getAttribute('aria-current')).toBe('date')
    expect(within(selected).getByTestId('note-dot-2026-07-16')).toBeTruthy()
    expect(view.getByTestId('note-dot-2026-07-13')).toBeTruthy()
    expect(view.queryByTestId('note-dot-2026-07-14')).toBeNull()

    await userEvent.click(selected)
    expect(hapticImpactLight).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('2026-07-16')
  })
})
