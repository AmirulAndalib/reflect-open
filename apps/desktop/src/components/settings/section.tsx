import type { ReactElement, ReactNode } from 'react'

interface SettingsSectionProps {
  /** The small heading shown above the card. */
  title: string
  /** The card's rows, separated by hairline dividers. */
  children: ReactNode
}

/**
 * The settings page idiom (the original app's): a small section heading over
 * a bordered card whose rows are separated by hairline dividers.
 */
export function SettingsSection({ title, children }: SettingsSectionProps): ReactElement {
  return (
    <section aria-label={title} className="mt-8 first:mt-0">
      <h2 className="px-1 text-[13px] font-semibold text-text">{title}</h2>
      <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface shadow-sm">
        {children}
      </div>
    </section>
  )
}
