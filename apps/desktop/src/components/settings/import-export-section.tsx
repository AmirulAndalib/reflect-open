import { useRef, useState, type ChangeEvent, type ReactElement } from 'react'
import { Upload } from 'lucide-react'
import {
  importReflectMarkdownZip,
  type ReflectMarkdownImportProgress,
  type ReflectMarkdownImportResult,
} from '@reflect/core'
import { Button } from '@/components/ui/button'
import { useAsyncAction } from '@/hooks/use-async-action'
import { rebuildIndexVisibly } from '@/lib/rebuild-index'
import { useGraph } from '@/providers/graph-provider'
import { SettingsField } from './field'
import { SettingsSection } from './section'

/** Settings controls for moving Reflect data into and out of the open graph. */
export function ImportExportSection(): ReactElement {
  const { graph, indexGeneration } = useGraph()
  const action = useAsyncAction()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [progress, setProgress] = useState<ReflectMarkdownImportProgress | null>(null)
  const [result, setResult] = useState<ReflectMarkdownImportResult | null>(null)

  const importFile = async (file: File): Promise<void> => {
    if (graph === null) {
      throw new Error('Open a graph before importing notes.')
    }
    setProgress(null)
    setResult(null)
    const data = await file.arrayBuffer()
    const summary = await importReflectMarkdownZip(data, {
      generation: graph.generation,
      onProgress: setProgress,
    })
    setResult(summary)
    if (summary.imported > 0 && indexGeneration !== null) {
      await rebuildIndexVisibly(indexGeneration)
    }
  }

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (file === null) {
      return
    }
    void action.run(() => importFile(file))
  }

  return (
    <SettingsSection id="import-export">
      <SettingsField
        legend="Import Reflect markdown"
        description="Import a ZIP created by Reflect's Markdown export. Existing notes are kept, and imported filename conflicts get a suffix."
      >
        <div className="mt-3 flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            onChange={onFileChange}
          />
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={graph === null || action.pending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload aria-hidden strokeWidth={1.75} />
              {action.pending ? 'Importing...' : 'Import ZIP...'}
            </Button>
          </div>

          {progress !== null && action.pending ? (
            <p className="text-xs text-text-muted">
              Importing {progress.done} of {progress.total}
            </p>
          ) : null}
          {result !== null ? (
            <p className="text-xs text-text-muted">{importSummary(result)}</p>
          ) : null}
          {action.error !== null ? (
            <p className="text-xs text-red-700 dark:text-red-300">{action.error}</p>
          ) : null}
        </div>
      </SettingsField>
    </SettingsSection>
  )
}

function importSummary(result: ReflectMarkdownImportResult): string {
  const parts = [
    `${result.imported} ${result.imported === 1 ? 'note' : 'notes'} imported`,
    `${result.daily} daily`,
    `${result.regular} regular`,
  ]
  if (result.renamed > 0) {
    parts.push(`${result.renamed} renamed`)
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} skipped`)
  }
  return `${parts.join(', ')}.`
}
