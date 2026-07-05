import type { ReactElement } from 'react'
import { isICloudRoot } from '@/lib/icloud-controller'
import { isMacosDesktop } from '@/lib/platform'
import { useGraph } from '@/providers/graph-provider'
import { BackupSettingsField } from './backup-section'
import { IcloudSettingsField } from './icloud-section'
import { SettingsSection } from './section'

/**
 * Settings → Sync: iCloud Drive and Git remote sync live together here. An
 * iCloud-hosted graph hides the GitHub backup controls because a graph syncs
 * through iCloud or a Git remote, not both.
 */
export function SyncSection(): ReactElement {
  const { graph } = useGraph()
  const iCloudSyncEnabled = isMacosDesktop && graph !== null && isICloudRoot(graph.root)

  return (
    <SettingsSection id="sync">
      <IcloudSettingsField />
      {iCloudSyncEnabled ? null : <BackupSettingsField />}
    </SettingsSection>
  )
}
