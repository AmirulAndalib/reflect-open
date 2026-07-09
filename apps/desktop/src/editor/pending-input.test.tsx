import { useEffect, type Ref } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoteEditor, type NoteEditorHandle } from './note-editor'

interface MockDocument {
  readonly revision: number
  eq(other: MockDocument): boolean
}

interface MockMeowdownHandle {
  readonly editor: {
    readonly state: { doc: MockDocument }
    readonly view: {
      readonly isDestroyed: boolean
      readonly domObserver: {
        forceFlush: ReturnType<typeof vi.fn<() => void>>
        flush: ReturnType<typeof vi.fn<() => void>>
      }
    }
  }
  getMarkdown(): string
}

let meowdownHandle: MockMeowdownHandle
let serializedMarkdown: string

vi.mock('@meowdown/react', () => ({
  MeowdownEditor: ({ handleRef }: { handleRef?: Ref<MockMeowdownHandle> }) => {
    useEffect(() => {
      if (typeof handleRef === 'function') {
        handleRef(meowdownHandle)
        return () => {
          handleRef(null)
        }
      }
      if (handleRef !== null && handleRef !== undefined) {
        handleRef.current = meowdownHandle
        return () => {
          handleRef.current = null
        }
      }
    }, [handleRef])
    return <div />
  },
}))

function mockDocument(revision: number): MockDocument {
  return {
    revision,
    eq: (other) => other.revision === revision,
  }
}

function renderEditor(): NoteEditorHandle {
  let handle: NoteEditorHandle | null = null
  render(
    <NoteEditor
      initialContent="# Business ideas\n"
      handleRef={(next) => {
        handle = next
      }}
    />,
  )
  if (handle === null) {
    throw new Error('editor handle was not mounted')
  }
  return handle
}

beforeEach(() => {
  serializedMarkdown = '# Business ideas\n'
  const state = { doc: mockDocument(0) }
  meowdownHandle = {
    editor: {
      state,
      view: {
        isDestroyed: false,
        domObserver: {
          forceFlush: vi.fn(),
          flush: vi.fn(),
        },
      },
    },
    getMarkdown: () => serializedMarkdown,
  }
  meowdownHandle.editor.view.domObserver.forceFlush.mockImplementationOnce(() => {
    serializedMarkdown = '# 🧠 Business ideas\n'
    state.doc = mockDocument(1)
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('pending native editor input', () => {
  it('commits a delayed composition before persistence reads markdown', () => {
    const handle = renderEditor()

    expect(handle.commitPendingInput()).toBe('# 🧠 Business ideas\n')
    expect(meowdownHandle.editor.view.domObserver.forceFlush).toHaveBeenCalledOnce()
    expect(meowdownHandle.editor.view.domObserver.flush).toHaveBeenCalledOnce()
    expect(handle.commitPendingInput()).toBeNull()
  })

  it('drains blur records even when forceFlush has no scheduled work', () => {
    const state = meowdownHandle.editor.state
    meowdownHandle.editor.view.domObserver.forceFlush.mockReset()
    meowdownHandle.editor.view.domObserver.flush.mockImplementationOnce(() => {
      serializedMarkdown = '# 🧠 Business ideas\n'
      state.doc = mockDocument(2)
    })
    const handle = renderEditor()

    expect(handle.getMarkdown()).toBe('# 🧠 Business ideas\n')
    expect(meowdownHandle.editor.view.domObserver.forceFlush).toHaveBeenCalledOnce()
    expect(meowdownHandle.editor.view.domObserver.flush).toHaveBeenCalledOnce()
  })
})
