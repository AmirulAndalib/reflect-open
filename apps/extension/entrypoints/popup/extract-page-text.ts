import { browser } from 'wxt/browser'
import {
  EXTRACT_PAGE_TEXT_MESSAGE_TYPE,
  extractPageTextResponseSchema,
  type ExtractPageTextRequest,
} from '@/lib/page-text'

const CAPTURE_CONTENT_SCRIPT = '/content-scripts/capture-content.js'

/** Extract normalized article paragraphs from the active tab's live DOM. */
export async function extractPageText(
  tabId: number,
  expectedUrl: string,
): Promise<string | undefined> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: [CAPTURE_CONTENT_SCRIPT],
  })
  const request: ExtractPageTextRequest = {
    type: EXTRACT_PAGE_TEXT_MESSAGE_TYPE,
    expectedUrl,
  }
  const response: unknown = await browser.tabs.sendMessage(tabId, request)
  const parsed = extractPageTextResponseSchema.parse(response)
  if (!parsed.ok) {
    throw new Error(parsed.message)
  }
  const contentText = parsed.contentText.trim()
  return contentText === '' ? undefined : contentText
}

/** Try optional page-text extraction without blocking the rest of the capture. */
export async function tryExtractPageText(
  tabId: number,
  expectedUrl: string,
): Promise<string | undefined> {
  try {
    return await extractPageText(tabId, expectedUrl)
  } catch (cause) {
    console.warn('capture page text could not be extracted:', cause)
    return undefined
  }
}
