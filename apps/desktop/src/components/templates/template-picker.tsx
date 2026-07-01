import { type ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage, listTemplates } from '@reflect/core'
import { FilePlus2, LayoutTemplate } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { getNoteEditor } from '@/editor/editor-registry'
import type { CommandContext } from '@/lib/commands/types'
import { templateBody } from '@/lib/note-templates'
import { startOperation } from '@/lib/operations'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { useNoteTemplates } from '@/providers/note-templates-provider'

/**
 * The "Insert template…" picker (docs/porting/note-templates.md): the graph's
 * templates A→Z, chosen with the palette's keyboard model, inserted verbatim
 * (frontmatter stripped) at the cursor of the note the command targeted. The
 * ever-present "New template" row is also the feature's front door when the
 * graph has no templates yet.
 */

interface TemplatePickerProps {
  /** The command capabilities (the same context the palette runs with). */
  context: CommandContext
}

export function TemplatePicker({ context }: TemplatePickerProps): ReactElement | null {
  const { pickerOpen, closeTemplatePicker, openTemplateCreate } = useNoteTemplates()
  const { graph } = useGraph()
  const { data: templates } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'templates'],
    queryFn: listTemplates,
    enabled: graph !== null && pickerOpen,
  })

  if (!pickerOpen) {
    return null
  }

  const insert = (path: string): void => {
    closeTemplatePicker()
    const target = context.notePath()
    if (target === null) {
      return
    }
    const editor = getNoteEditor(target)
    if (editor === null) {
      return
    }
    void templateBody(path)
      .then((body) => {
        editor.insertMarkdown(body)
        editor.focus()
      })
      .catch((cause: unknown) => {
        startOperation('Inserting template').fail(errorMessage(cause))
      })
  }

  return (
    <CommandDialog
      open={pickerOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeTemplatePicker()
        }
      }}
      title="Insert template"
      description="Choose a template to insert at the cursor"
    >
      <CommandInput placeholder="Insert template…" />
      <CommandList>
        <CommandEmpty>No templates</CommandEmpty>
        {templates !== undefined && templates.length > 0 ? (
          <CommandGroup>
            {templates.map((template) => (
              <CommandItem
                key={template.path}
                // Title + path: cmdk matches on the value, and duplicate
                // titles across files must stay distinct rows.
                value={`${template.title} ${template.path}`}
                onSelect={() => insert(template.path)}
              >
                <LayoutTemplate aria-hidden strokeWidth={1.75} className="text-text-muted" />
                <span className="truncate">{template.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup forceMount>
          <CommandItem forceMount value="new-template" onSelect={openTemplateCreate}>
            <FilePlus2 aria-hidden strokeWidth={1.75} className="text-text-muted" />
            New template
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
