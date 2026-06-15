import Defuddle from 'defuddle'
import { browser } from 'wxt/browser'
import {
  extractPageTextRequestSchema,
  formatParagraphs,
  type ExtractPageTextResponse,
} from '@/lib/page-text'

declare global {
  interface Window {
    __reflectCaptureTextInstalled?: boolean
  }
}

function visibleParagraphs(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('p'))
    .filter((paragraph) => paragraph.textContent !== null)
    .map((paragraph) => paragraph.textContent ?? '')
}

function paragraphsFromHtml(html: string): string[] {
  const template = document.createElement('template')
  template.innerHTML = html
  return visibleParagraphs(template.content)
}

function fallbackParagraphs(): string[] {
  const root = document.querySelector('article, main') ?? document.body
  return root ? visibleParagraphs(root) : []
}

function extractPageText(): ExtractPageTextResponse {
  try {
    const clone = document.cloneNode(true)
    if (!(clone instanceof Document)) {
      return { ok: false, message: 'Could not clone the page document.' }
    }
    const article = new Defuddle(clone, {
      url: document.location.href,
      useAsync: false,
      includeReplies: false,
      removeImages: true,
    }).parse()
    const articleParagraphs = article.content ? paragraphsFromHtml(article.content) : []
    const contentText = formatParagraphs(
      articleParagraphs.length > 0 ? articleParagraphs : fallbackParagraphs(),
    )
    return { ok: true, contentText }
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : String(cause) }
  }
}

export default defineContentScript({
  registration: 'runtime',
  main() {
    if (window.__reflectCaptureTextInstalled) {
      return
    }
    window.__reflectCaptureTextInstalled = true
    browser.runtime.onMessage.addListener((message: unknown) => {
      const request = extractPageTextRequestSchema.safeParse(message)
      if (!request.success) {
        return undefined
      }
      return Promise.resolve(extractPageText())
    })
  },
})
