import { describe, expect, it } from 'vitest'
import { detectConflictMarkers } from './conflict-markers'

const CONFLICTED = [
  '# Shared',
  '',
  '<<<<<<< this device',
  'edited on a',
  '=======',
  'edited on b',
  '>>>>>>> other device',
  '',
].join('\n')

describe('detectConflictMarkers', () => {
  it('detects a complete labeled marker block', () => {
    expect(detectConflictMarkers(CONFLICTED)).toBe(true)
  })

  it('detects markers with CRLF line endings', () => {
    expect(detectConflictMarkers(CONFLICTED.replaceAll('\n', '\r\n'))).toBe(true)
  })

  it('requires the full sequence in order', () => {
    expect(detectConflictMarkers('plain note body')).toBe(false)
    expect(detectConflictMarkers('<<<<<<< this device\nno separator or end')).toBe(false)
    expect(detectConflictMarkers('=======\n>>>>>>> other device\n<<<<<<< late start')).toBe(false)
  })

  it('ignores prose that merely mentions a marker line', () => {
    const prose = 'Git writes `>>>>>>> theirs` after a `=======` separator.'
    expect(detectConflictMarkers(prose)).toBe(false)
  })

  it('requires a label after the start/end arrows (as git writes them)', () => {
    expect(detectConflictMarkers('<<<<<<<\nx\n=======\ny\n>>>>>>>')).toBe(false)
  })

  it('clears once the user resolves by editing the markers away', () => {
    const resolved = CONFLICTED.split('\n')
      .filter((line) => !line.startsWith('<<<<<<<') && line !== '=======' && !line.startsWith('>>>>>>>'))
      .join('\n')
    expect(detectConflictMarkers(resolved)).toBe(false)
  })
})
