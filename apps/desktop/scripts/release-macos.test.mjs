import { expect, test } from 'vitest'

import { createBetaFeedReleaseArgs, createReleaseArgs, uploadBetaFeedArgs } from './release-macos.mjs'

const baseInput = {
  assets: ['Reflect.dmg', 'Reflect.app.tar.gz', 'Reflect.app.tar.gz.sig', 'latest.json'],
  commit: 'abc123',
  draft: false,
  productName: 'Reflect',
}

test('pre-release publish opts out of GitHub latest heuristics', () => {
  const args = createReleaseArgs({
    ...baseInput,
    prerelease: true,
    tag: 'v0.2.0-beta.14',
    version: '0.2.0-beta.14',
  })

  expect(args).toEqual([
    'release',
    'create',
    'v0.2.0-beta.14',
    'Reflect.dmg',
    'Reflect.app.tar.gz',
    'Reflect.app.tar.gz.sig',
    'latest.json',
    '--title',
    'Reflect 0.2.0-beta.14',
    '--target',
    'abc123',
    '--generate-notes',
    '--prerelease',
    '--latest=false',
  ])
})

test('stable publish marks the release as latest', () => {
  const args = createReleaseArgs({
    ...baseInput,
    prerelease: false,
    tag: 'v0.2.0',
    version: '0.2.0',
  })

  expect(args).toContain('--latest')
  expect(args).not.toContain('--prerelease')
  expect(args).not.toContain('--latest=false')
})

test('draft publish keeps the draft flag last', () => {
  const args = createReleaseArgs({
    ...baseInput,
    draft: true,
    prerelease: true,
    tag: 'v0.2.0-beta.15',
    version: '0.2.0-beta.15',
  })

  expect(args.at(-1)).toBe('--draft')
})

test('beta feed release is a non-latest prerelease pointer', () => {
  expect(createBetaFeedReleaseArgs({ commit: 'abc123', manifestPath: 'latest.json' })).toEqual([
    'release',
    'create',
    'updater-beta',
    'latest.json',
    '--title',
    'Reflect beta updater feed',
    '--target',
    'abc123',
    '--prerelease',
    '--latest=false',
    '--notes',
    'Moving updater feed for beta builds. Do not install this release directly.',
  ])
})

test('beta feed upload replaces the moving manifest', () => {
  expect(uploadBetaFeedArgs({ manifestPath: 'latest.json' })).toEqual([
    'release',
    'upload',
    'updater-beta',
    'latest.json',
    '--clobber',
  ])
})
