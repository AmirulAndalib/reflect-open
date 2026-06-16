import { FileText } from 'lucide-react'
import type { ReactElement } from 'react'
import { InlineAlert } from '@/components/inline-alert'
import { Button } from '@/components/ui/button'
import { useAssetDescriptions } from '@/providers/asset-description-provider'
import { SettingsField } from './field'

export function AssetDescriptionsField(): ReactElement {
  const { available, backfill, backfilling, progress, lastResult, error } = useAssetDescriptions()
  const disabled = !available || backfilling
  const label = backfilling ? 'Describing assets...' : 'Describe existing assets'

  return (
    <SettingsField
      legend="Asset descriptions"
      description="Create markdown sidecars for eligible images and PDFs so their contents can be searched in a future version. This sends assets to your configured AI provider and may incur provider charges."
    >
      <div className="mt-3 space-y-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => void backfill()}
          className="border border-border"
        >
          <FileText aria-hidden strokeWidth={1.75} />
          {label}
        </Button>
        {!available ? (
          <p className="text-xs text-text-muted">Add an AI provider before describing assets.</p>
        ) : null}
        {progress !== null && progress.total > 0 ? (
          <p className="text-xs text-text-muted">
            {progress.done} of {progress.total}
            {progress.path ? ` - ${progress.path}` : ''}
          </p>
        ) : null}
        {lastResult !== null ? <InlineAlert>{lastResult}</InlineAlert> : null}
        {error !== null ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      </div>
    </SettingsField>
  )
}
