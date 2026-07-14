import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'find-github-release.sh')

function runLookup({
  output = '[]',
  outputs,
  repository = 'team-reflect/reflect-open',
  scriptArgs,
  status = 0,
  statuses,
  tag = 'v0.6.0-beta.14',
  waitForVisible = false,
}) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'find-github-release-'))
  const mockGhPath = join(temporaryDirectory, 'gh')
  const mockSleepPath = join(temporaryDirectory, 'sleep')
  const argsPath = join(temporaryDirectory, 'args.txt')
  const countPath = join(temporaryDirectory, 'count.txt')
  const sleepArgsPath = join(temporaryDirectory, 'sleep-args.txt')
  const responseOutputs = outputs ?? [output]
  const responseStatuses = statuses ?? responseOutputs.map((_, index) => (index === 0 ? status : 0))
  writeFileSync(
    mockGhPath,
    `#!/usr/bin/env bash
count=0
if [ -f "$MOCK_GH_COUNT_PATH" ]; then
  count="$(< "$MOCK_GH_COUNT_PATH")"
fi
count="$((count + 1))"
printf '%s\n' "$count" > "$MOCK_GH_COUNT_PATH"
printf '%s\n' "$*" >> "$MOCK_GH_ARGS_PATH"
response_index="$count"
if [ "$response_index" -gt "$MOCK_GH_RESPONSE_COUNT" ]; then
  response_index="$MOCK_GH_RESPONSE_COUNT"
fi
status_variable="MOCK_GH_STATUS_\${response_index}"
output_variable="MOCK_GH_OUTPUT_\${response_index}"
response_status="\${!status_variable}"
if [ "$response_status" -ne 0 ]; then
  echo 'mock gh failure' >&2
  exit "$response_status"
fi
printf '%s' "\${!output_variable}"
`,
  )
  writeFileSync(
    mockSleepPath,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$MOCK_SLEEP_ARGS_PATH"
`,
  )
  chmodSync(mockGhPath, 0o755)
  chmodSync(mockSleepPath, 0o755)

  try {
    const mockResponses = Object.fromEntries(
      responseOutputs.flatMap((responseOutput, index) => [
        [`MOCK_GH_OUTPUT_${index + 1}`, responseOutput],
        [`MOCK_GH_STATUS_${index + 1}`, String(responseStatuses[index] ?? 0)],
      ]),
    )
    const lookupArgs = scriptArgs ?? (waitForVisible ? ['--wait-for-visible', tag] : [tag])
    const result = spawnSync('bash', [scriptPath, ...lookupArgs], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: repository,
        MOCK_GH_ARGS_PATH: argsPath,
        MOCK_GH_COUNT_PATH: countPath,
        MOCK_GH_RESPONSE_COUNT: String(responseOutputs.length),
        MOCK_SLEEP_ARGS_PATH: sleepArgsPath,
        ...mockResponses,
        PATH: `${temporaryDirectory}:${process.env.PATH ?? ''}`,
      },
    })
    const args = existsSync(argsPath) ? readFileSync(argsPath, 'utf8').trim() : ''
    const sleepArgs = existsSync(sleepArgsPath) ? readFileSync(sleepArgsPath, 'utf8').trim() : ''
    return {
      args,
      exitCode: result.status,
      ghCallCount: args === '' ? 0 : args.split('\n').length,
      sleepArgs,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  }
}

test('finds a draft release by exact tag', () => {
  const draft = {
    draft: true,
    prerelease: true,
    published_at: null,
    tag_name: 'v0.6.0-beta.14',
    target_commitish: 'a'.repeat(40),
  }
  const result = runLookup({
    output: JSON.stringify([{ tag_name: 'v0.6.0-beta.13' }, draft]),
  })

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(draft)
  expect(result.args).toBe(
    'api --paginate repos/team-reflect/reflect-open/releases?per_page=100',
  )
})

test('finds a published release on a later page', () => {
  const published = {
    draft: false,
    prerelease: false,
    published_at: '2026-07-13T20:00:00Z',
    tag_name: 'v0.6.0',
    target_commitish: 'b'.repeat(40),
  }
  const result = runLookup({
    output: `${JSON.stringify([{ tag_name: 'v0.5.0' }])}\n${JSON.stringify([published])}`,
    tag: 'v0.6.0',
  })

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(published)
})

test('prints null when no release matches', () => {
  const result = runLookup({ output: JSON.stringify([{ tag_name: 'v0.5.0' }]) })

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe('null\n')
  expect(result.ghCallCount).toBe(1)
  expect(result.sleepArgs).toBe('')
})

test('waits for a newly created draft to become visible', () => {
  const draft = { draft: true, tag_name: 'v0.6.0-beta.14' }
  const result = runLookup({
    outputs: ['[]', '[]', JSON.stringify([draft])],
    waitForVisible: true,
  })

  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(draft)
  expect(result.ghCallCount).toBe(3)
  expect(result.sleepArgs).toBe('2\n2')
  expect(result.stderr).toContain('v0.6.0-beta.14 is not visible yet; retrying')
})

test('returns null after bounded visibility retries are exhausted', () => {
  const result = runLookup({ output: '[]', waitForVisible: true })

  expect(result.exitCode).toBe(0)
  expect(result.stdout).toBe('null\n')
  expect(result.ghCallCount).toBe(6)
  expect(result.sleepArgs).toBe('2\n2\n2\n2\n2')
})

test('fails closed when multiple releases use the tag', () => {
  const release = { tag_name: 'v0.6.0-beta.14' }
  const result = runLookup({
    output: `${JSON.stringify([release])}\n${JSON.stringify([release])}`,
    waitForVisible: true,
  })

  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain('multiple releases use tag v0.6.0-beta.14')
  expect(result.ghCallCount).toBe(1)
  expect(result.sleepArgs).toBe('')
})

test('propagates GitHub API failures instead of reporting an absent release', () => {
  const result = runLookup({
    outputs: ['[]', ''],
    statuses: [0, 2],
    waitForVisible: true,
  })

  expect(result.exitCode).not.toBe(0)
  expect(result.stderr).toContain('mock gh failure')
  expect(result.stdout).not.toBe('null\n')
  expect(result.ghCallCount).toBe(2)
  expect(result.sleepArgs).toBe('2')
})

test('does not retry malformed GitHub responses', () => {
  const result = runLookup({ output: '{}', waitForVisible: true })

  expect(result.exitCode).not.toBe(0)
  expect(result.ghCallCount).toBe(1)
  expect(result.sleepArgs).toBe('')
})

test('rejects invalid repository and tag inputs before calling GitHub', () => {
  const invalidRepository = runLookup({ output: '[]', repository: 'not-a-repository' })
  const invalidTag = runLookup({ output: '[]', tag: 'latest' })
  const invalidOption = runLookup({ output: '[]', scriptArgs: ['--eventually', 'v0.6.0'] })

  expect(invalidRepository.exitCode).toBe(1)
  expect(invalidRepository.stderr).toContain('GITHUB_REPOSITORY must be an owner/repository name')
  expect(invalidTag.exitCode).toBe(1)
  expect(invalidTag.stderr).toContain('invalid release tag latest')
  expect(invalidOption.exitCode).toBe(1)
  expect(invalidOption.stderr).toContain('expected [--wait-for-visible] <release-tag>')
  expect(invalidRepository.ghCallCount).toBe(0)
  expect(invalidTag.ghCallCount).toBe(0)
  expect(invalidOption.ghCallCount).toBe(0)
})
