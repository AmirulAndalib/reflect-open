import { useEffect, type ReactElement } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { requestContactsAccess } from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import {
  useContactsAuthorization,
  useRefreshContactsAuthorization,
} from '@/hooks/use-contacts-authorization'
import { useSettings } from '@/providers/settings-provider'
import { SettingsSection } from './section'
import { SettingsSwitchField } from './switch-field'

/** macOS System Settings, opened straight to the Contacts privacy pane. */
const CONTACTS_PRIVACY_PANE =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts'

/**
 * The Apple integrations section (the contacts-integration port): a Contacts
 * switch backed by live `CNContactStore` reads — permission on/off is the
 * whole state, so there is no sync status to show. Turning it on triggers the
 * OS permission prompt; a denial keeps the switch on and points at System
 * Settings, since the app cannot re-prompt once the user has decided. The
 * section renders only where the framework exists (macOS/iOS) — see
 * {@link useVisibleSettingsSections}.
 */
export function IntegrationsSection(): ReactElement | null {
  const { settings, updateSettings } = useSettings()
  const authorization = useContactsAuthorization()
  const refreshAuthorization = useRefreshContactsAuthorization()

  // The user grants access in System Settings, not in the app, so re-read the
  // permission whenever the window regains focus while the integration is on.
  const contactsEnabled = settings.contactsEnabled
  useEffect(() => {
    if (!contactsEnabled) {
      return
    }
    function onFocus(): void {
      void refreshAuthorization()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [contactsEnabled, refreshAuthorization])

  if (authorization === null || authorization === 'unavailable') {
    return null
  }

  const showDenied =
    settings.contactsEnabled && (authorization === 'denied' || authorization === 'restricted')

  async function enableContacts(): Promise<void> {
    updateSettings({ contactsEnabled: true })
    if (authorization === 'notDetermined') {
      await requestContactsAccess()
      await refreshAuthorization()
    }
  }

  return (
    <SettingsSection id="integrations">
      <div>
        <SettingsSwitchField
          legend="Contacts"
          description="Suggest details from Apple Contacts on notes that match a contact's name. Lookups stay on this device."
          checked={settings.contactsEnabled}
          onCheckedChange={(checked) => {
            if (checked) {
              void enableContacts()
            } else {
              updateSettings({ contactsEnabled: false })
            }
          }}
        />
        {showDenied ? (
          <div className="px-4 pb-3.5">
            <InlineAlert tone="warning">
              Reflect doesn’t have contacts access.{' '}
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => {
                  void openUrl(CONTACTS_PRIVACY_PANE)
                }}
              >
                Open System Settings
              </button>{' '}
              to allow it, then return here.
            </InlineAlert>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}
