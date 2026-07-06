import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConflictNoteView } from './conflict-note-view'

const CONFLICTED = [
  '# Standup',
  '',
  "<<<<<<< Alex's MacBook Pro",
  '- mac line',
  '=======',
  '- phone line',
  ">>>>>>> Alex's iPhone",
  'outro',
  '',
].join('\n')

afterEach(cleanup)

describe('ConflictNoteView', () => {
  it('renders both sides labeled by device, without raw marker lines', () => {
    render(<ConflictNoteView content={CONFLICTED} />)

    expect(screen.getByText("Alex's MacBook Pro")).toBeTruthy()
    expect(screen.getByText("Alex's iPhone")).toBeTruthy()
    expect(screen.getByText(/mac line/)).toBeTruthy()
    expect(screen.getByText(/phone line/)).toBeTruthy()
    // Surrounding text stays verbatim; the marker syntax becomes chrome.
    expect(screen.getByText(/# Standup/)).toBeTruthy()
    expect(screen.getByText(/outro/)).toBeTruthy()
    expect(screen.queryByText(/<<<<<<</)).toBeNull()
    expect(screen.queryByText(/=======/)).toBeNull()
  })

  it('marks an empty side instead of collapsing it', () => {
    const stacked = '<<<<<<< Mac\nmac\n=======\nphone\n>>>>>>> iPhone\n<<<<<<< Mac\n=======\nipad\n>>>>>>> iPad\n'
    render(<ConflictNoteView content={stacked} />)

    expect(screen.getByText('Empty on this side')).toBeTruthy()
    expect(screen.getByText(/ipad/)).toBeTruthy()
  })

  it('shows an unterminated block verbatim rather than styling it', () => {
    render(<ConflictNoteView content={'before\n<<<<<<< this device\nkept line'} />)

    expect(screen.getByText(/<<<<<<< this device/)).toBeTruthy()
    expect(screen.getByText(/kept line/)).toBeTruthy()
  })
})
