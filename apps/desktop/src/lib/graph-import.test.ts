import { describe, expect, it } from 'vitest'
import {
  classifyDrop,
  isZipFileName,
  looksLikeGraphPaths,
  shouldSkipImportEntry,
} from './graph-import'

describe('isZipFileName', () => {
  it('matches the .zip extension case-insensitively', () => {
    expect(isZipFileName('Export.zip')).toBe(true)
    expect(isZipFileName('Export.ZIP')).toBe(true)
    expect(isZipFileName('notes.md')).toBe(false)
    expect(isZipFileName('archive.zip.txt')).toBe(false)
  })
})

describe('shouldSkipImportEntry', () => {
  it('skips the rebuildable index, VCS metadata, macOS noise, and OS junk', () => {
    expect(shouldSkipImportEntry('.reflect/index.sqlite')).toBe(true)
    expect(shouldSkipImportEntry('.git/config')).toBe(true)
    expect(shouldSkipImportEntry('__MACOSX/export/._a.md')).toBe(true)
    expect(shouldSkipImportEntry('notes/._a.md')).toBe(true)
    expect(shouldSkipImportEntry('notes/.DS_Store')).toBe(true)
    expect(shouldSkipImportEntry('notes/draft.md.swp')).toBe(true)
    expect(shouldSkipImportEntry('Thumbs.db')).toBe(true)
  })

  it('keeps real graph files', () => {
    expect(shouldSkipImportEntry('notes/Welcome.md')).toBe(false)
    expect(shouldSkipImportEntry('daily/2026-06-24.md')).toBe(false)
    expect(shouldSkipImportEntry('assets/pic.png')).toBe(false)
  })
})

describe('looksLikeGraphPaths', () => {
  it('accepts markdown under daily/ or notes/, even nested in a wrapper', () => {
    expect(looksLikeGraphPaths(['notes/Welcome.md'])).toBe(true)
    expect(looksLikeGraphPaths(['daily/2026-06-24.md'])).toBe(true)
    expect(looksLikeGraphPaths(['my-graph/notes/a.md'])).toBe(true)
  })

  it('rejects a folder with no Reflect notes', () => {
    expect(looksLikeGraphPaths(['README.md', 'src/index.ts'])).toBe(false)
    expect(looksLikeGraphPaths(['assets/pic.png'])).toBe(false)
    expect(looksLikeGraphPaths([])).toBe(false)
  })

  it('matches the .md extension case-sensitively, mirroring Rust validation', () => {
    expect(looksLikeGraphPaths(['notes/A.MD'])).toBe(false)
    expect(looksLikeGraphPaths(['daily/2026-06-24.Md'])).toBe(false)
  })
})

describe('classifyDrop', () => {
  function directoryItem(name: string): DataTransferItem {
    const entry = { isDirectory: true, isFile: false, name }
    return {
      kind: 'file',
      webkitGetAsEntry: () => entry,
    } as unknown as DataTransferItem
  }

  function transferOf(items: DataTransferItem[], files: File[]): DataTransfer {
    return { items, files } as unknown as DataTransfer
  }

  it('classifies a dropped directory as a folder import', () => {
    const result = classifyDrop(transferOf([directoryItem('My Graph')], []))
    expect(result.kind).toBe('folder')
    expect(result.kind === 'folder' && result.name).toBe('My Graph')
  })

  it('classifies a dropped .zip via the file list', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'export.zip')
    const result = classifyDrop(transferOf([], [file]))
    expect(result.kind).toBe('zip')
    expect(result.kind === 'zip' && result.name).toBe('export.zip')
  })

  it('returns none for an unsupported drop', () => {
    const file = new File(['hi'], 'note.txt')
    expect(classifyDrop(transferOf([], [file])).kind).toBe('none')
  })
})
