import { lazy, Suspense, useEffect, useState, type ReactElement } from 'react'
import { getAppPlatform, hasBridge, isMobilePlatform, type AppPlatform } from '@reflect/core'

const DesktopRoot = lazy(() =>
  import('@/desktop-root').then((module) => ({ default: module.DesktopRoot })),
)
const MobileRoot = lazy(() =>
  import('@/mobile/mobile-root').then((module) => ({ default: module.MobileRoot })),
)

// Eagerly start the platform IPC call at module evaluation time — this is a
// build-time constant (the Rust shell's compile-time platform tag) that never
// changes within a session. Hoisting it here makes the round-trip concurrent
// with JS parse/React mount rather than serial after the first paint.
const platformPromise: Promise<AppPlatform> = hasBridge()
  ? getAppPlatform().catch(() => 'desktop' as AppPlatform)
  : Promise.resolve('desktop' as AppPlatform)

/**
 * The Plan 19 root gate: one bundle, two surface trees. The shell reports
 * which platform it was built for and the matching tree loads as a lazy
 * chunk — desktop chrome never reaches the mobile critical path, and vice
 * versa. Plain-browser dev (no Tauri bridge) gets the desktop tree.
 */
export function PlatformRoot(): ReactElement {
  // Plain-browser dev has no bridge — start on the desktop tree directly. With a
  // bridge, resolve the real platform from the already-in-flight module-scope
  // promise so the IPC call started before React mounted.
  const [platform, setPlatform] = useState<AppPlatform | null>(() =>
    hasBridge() ? null : 'desktop',
  )

  useEffect(() => {
    if (!hasBridge()) {
      return
    }
    let active = true
    void platformPromise.then((resolved) => {
      if (active) {
        setPlatform(resolved)
      }
    })
    return () => {
      active = false
    }
  }, [])

  if (platform === null) {
    return <div className="h-screen w-screen" />
  }

  return (
    <Suspense fallback={<div className="h-screen w-screen" />}>
      {isMobilePlatform(platform) ? <MobileRoot platform={platform} /> : <DesktopRoot />}
    </Suspense>
  )
}
