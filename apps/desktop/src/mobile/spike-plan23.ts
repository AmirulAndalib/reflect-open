// TEMPORARY Plan 23 spike instrumentation — simulator/device verdicts get
// recorded in `docs/plans/23-mobile-ai-chat.md` (step 0); delete this module,
// the `spike_log` command, the `127.0.0.1:8787` capability entry, and the
// `mobile-app.tsx` hook once they are.
//
// Probes the platform behaviors the chat port cannot assume on iOS:
// 1. `providerFetch` (tauri-plugin-http) delivers response chunks
//    incrementally — the difference between chat that streams and chat that
//    "types" one paragraph after a long silence.
// 2. The iOS keychain round-trips an `ai-api-key:*` secret.
// 3. `chat_message_save` / `loadChatMessages` round-trip on the mobile index
//    DB, including across an app relaunch (first boot plants a row, the next
//    boot finds it and cleans up).
// 4. A long stream's behavior across backgrounding (driven manually via
//    `simctl`; this just logs chunk arrivals and the terminal outcome).

import {
  deleteChatConversation,
  deleteSecret,
  getSecret,
  loadChatMessages,
  saveChatMessage,
  setSecret,
  type ChatTurn,
} from '@reflect/core'
import { invoke } from '@tauri-apps/api/core'
import { providerFetch } from '@/lib/provider-fetch'

const SSE_BASE = 'http://127.0.0.1:8787'
const SPIKE_CONVERSATION_ID = 'plan23-spike-conversation'
const SPIKE_SECRET = 'ai-api-key:plan23-spike'

async function log(line: string): Promise<void> {
  try {
    await invoke('spike_log', { line: `[plan23-spike] ${line}` })
  } catch {
    console.info(`[plan23-spike] ${line}`)
  }
}

function report(name: string, outcome: string | null): Promise<void> {
  return outcome === null ? log(`PASS: ${name}`) : log(`FAIL: ${name} — ${outcome}`)
}

/** Milliseconds between consecutive arrival times. */
function gapsOf(times: number[]): number[] {
  return times.slice(1).map((time, index) => time - (times[index] ?? time))
}

/** Read a streaming response, returning the arrival time of every chunk. */
async function chunkTimes(url: string, onChunk?: (text: string) => void): Promise<number[]> {
  const response = await providerFetch(url)
  if (!response.ok || response.body === null) {
    throw new Error(`status ${response.status}, body ${response.body === null ? 'null' : 'set'}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const times: number[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      return times
    }
    times.push(Date.now())
    onChunk?.(decoder.decode(value, { stream: true }))
  }
}

/** Probe 1: chunks must arrive spread out, not buffered into one delivery. */
async function checkStreaming(): Promise<string | null> {
  const times = await chunkTimes(`${SSE_BASE}/sse`)
  const gaps = gapsOf(times)
  const spreadGaps = gaps.filter((gap) => gap >= 200).length
  await log(`streaming: ${times.length} chunks, gaps [${gaps.join(', ')}]ms`)
  // The server sends 6 chunks 400ms apart: a streaming transport shows most
  // gaps near 400ms; a buffering one delivers everything at once (gaps ~0).
  if (times.length < 4) {
    return `only ${times.length} chunk deliveries — response looks buffered`
  }
  if (spreadGaps < 3) {
    return `only ${spreadGaps} inter-chunk gaps >= 200ms — response looks coalesced`
  }
  return null
}

/** Probe 2: iOS keychain round-trip under the chat key-naming policy. */
async function checkKeychain(): Promise<string | null> {
  await setSecret(SPIKE_SECRET, 'sk-plan23')
  const read = await getSecret(SPIKE_SECRET)
  await deleteSecret(SPIKE_SECRET)
  const gone = await getSecret(SPIKE_SECRET)
  if (read !== 'sk-plan23') {
    return `read back ${JSON.stringify(read)}`
  }
  if (gone !== null) {
    return 'secret survived deletion'
  }
  return null
}

/**
 * Probe 3: chat persistence on the mobile index DB. Finding rows from a
 * previous boot proves relaunch durability (and cleans them up); every boot
 * plants one row for the next.
 */
async function checkChatStore(indexGeneration: number): Promise<string | null> {
  const existing = await loadChatMessages(SPIKE_CONVERSATION_ID)
  if (existing.length > 0) {
    await log(`chat store: found ${existing.length} row(s) from a previous boot — relaunch PASS`)
    await deleteChatConversation(SPIKE_CONVERSATION_ID, indexGeneration)
    const afterDelete = await loadChatMessages(SPIKE_CONVERSATION_ID)
    if (afterDelete.length !== 0) {
      return `delete left ${afterDelete.length} row(s)`
    }
  } else {
    await log('chat store: no prior row — relaunch half runs on the next boot')
  }
  const now = Date.now()
  const turn: ChatTurn = {
    id: `plan23-spike-turn-${now}`,
    userText: 'plan23 spike turn',
    attachments: [],
    parts: [{ kind: 'text', text: 'plan23 spike reply' }],
    responseMessages: [],
    status: 'done',
  }
  await saveChatMessage({
    conversation: {
      id: SPIKE_CONVERSATION_ID,
      title: 'plan23 spike',
      createdMs: now,
      updatedMs: now,
    },
    turn,
    createdMs: now,
    generation: indexGeneration,
  })
  const reread = (await loadChatMessages(SPIKE_CONVERSATION_ID))[0]
  if (reread === undefined) {
    return 'saved turn did not read back'
  }
  if (reread.userText !== 'plan23 spike turn') {
    return `read back unexpected turn ${JSON.stringify(reread.userText)}`
  }
  return null
}

/**
 * Probe 4: a 60s stream whose chunk log shows what backgrounding does to an
 * in-flight response (suspend/resume vs error). Drive the app background via
 * `xcrun simctl` while this runs; the terminal line tells the story.
 */
async function checkBackgrounding(): Promise<void> {
  await log('background probe: starting 60s stream — background the app now')
  try {
    const times = await chunkTimes(`${SSE_BASE}/sse-long`, () => undefined)
    const gaps = gapsOf(times)
    const longestGap = gaps.length > 0 ? Math.max(...gaps) : 0
    await log(
      `background probe: stream ended normally, ${times.length}/60 chunks, longest gap ${longestGap}ms`,
    )
  } catch (error) {
    await log(`background probe: stream errored — ${String(error)}`)
  }
}

let ran = false

/** Run every probe once per app boot, logging one verdict line each. */
export async function runPlan23Spike(indexGeneration: number): Promise<void> {
  if (ran) {
    return
  }
  ran = true
  await report('streaming granularity', await checkStreaming().catch((error) => String(error)))
  await report('keychain ai-api-key round-trip', await checkKeychain().catch((error) => String(error)))
  await report(
    'chat store save/load',
    await checkChatStore(indexGeneration).catch((error) => String(error)),
  )
  void checkBackgrounding()
}
