import { afterEach, describe, expect, it } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { detectExternalMoves } from './move-healing'

afterEach(() => {
  setBridge(null)
})

const ORPHAN = 'notes/01arz3ndektsv4rrffq69g5fav.md'
const ARRIVAL = 'notes/meeting-notes.md'
const ID = '01abcdefghjkmnpqrstvwxyz00'
const CONTENT = `---\nid: ${ID}\n---\n# Meeting Notes\n`

function fakeBridge(invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>) {
  setBridge({
    invoke,
    listen: async () => () => {},
  })
}

describe('detectExternalMoves', () => {
  it('pairs an orphan with the arrival carrying its id and hands back the content', async () => {
    fakeBridge(async (command) => {
      if (command === 'note_read') {
        return CONTENT
      }
      if (command === 'db_query') {
        return [{ path: ORPHAN, id: ID }]
      }
      return null
    })

    const scan = await detectExternalMoves([ORPHAN], [ARRIVAL])
    expect(scan.moves).toEqual([{ from: ORPHAN, to: ARRIVAL }])
    expect(scan.content.get(ARRIVAL)).toBe(CONTENT)
  })

  it('skips an unreadable arrival: no pair, no content, no throw', async () => {
    fakeBridge(async (command) => {
      if (command === 'note_read') {
        throw { kind: 'io', message: 'locked' }
      }
      if (command === 'db_query') {
        return [{ path: ORPHAN, id: ID }]
      }
      return null
    })

    const scan = await detectExternalMoves([ORPHAN], [ARRIVAL])
    expect(scan.moves).toEqual([])
    expect(scan.content.size).toBe(0)
  })

  it('never touches the bridge when either side is empty', async () => {
    const calls: string[] = []
    fakeBridge(async (command) => {
      calls.push(command)
      return null
    })

    expect((await detectExternalMoves([], [ARRIVAL])).moves).toEqual([])
    expect((await detectExternalMoves([ORPHAN], [])).moves).toEqual([])
    expect(calls).toEqual([])
  })

  it('returns no moves once aborted — the caller is bailing anyway', async () => {
    const controller = new AbortController()
    fakeBridge(async (command) => {
      if (command === 'db_query') {
        controller.abort()
        return [{ path: ORPHAN, id: ID }]
      }
      return CONTENT
    })

    const scan = await detectExternalMoves([ORPHAN], [ARRIVAL], { signal: controller.signal })
    expect(scan.moves).toEqual([])
  })
})
