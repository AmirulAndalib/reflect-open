import { splitFrontmatter } from '@reflect/core'

/** Exact frontmatter bytes (may be empty) and the body that follows them. */
export function splitDoc(content: string): { header: string; body: string } {
  const { body, bodyOffset } = splitFrontmatter(content)
  return { header: content.slice(0, bodyOffset), body }
}
