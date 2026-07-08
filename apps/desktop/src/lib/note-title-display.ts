import { scanInlineSegments } from '@reflect/core'

export function displayNoteTitle(title: string): string {
  return scanInlineSegments(title)
    .map((segment) => {
      switch (segment.kind) {
        case 'text':
          return segment.text
        case 'wikiLink':
          return segment.alias ?? segment.target
        case 'link':
          return segment.text
      }
    })
    .join('')
}
