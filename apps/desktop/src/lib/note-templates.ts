import {
  availableTemplatePath,
  readNote,
  slugForTitle,
  splitFrontmatter,
  writeNote,
} from '@reflect/core'

/**
 * Note templates (docs/porting/note-templates.md): markdown files under
 * `templates/`, inserted verbatim at the cursor. This module owns the two
 * file-level operations — reading a template's insertable body and creating a
 * new template — shared by the palette commands and the settings section.
 */

/**
 * The insertable body of a template: its markdown with any frontmatter
 * stripped (v1 parity — template frontmatter is metadata, never content).
 */
export async function templateBody(path: string): Promise<string> {
  return splitFrontmatter(await readNote(path)).body
}

/**
 * Create a template named `name` at a collision-free `templates/<slug>.md`
 * (the `-2` suffix policy notes use), seeded with the name as its H1 so the
 * title matches from the first open. Returns the new graph-relative path.
 * The first template write also creates the `templates/` folder — it is not
 * bootstrapped with the graph (no-litter).
 */
export async function createTemplate(name: string, generation: number): Promise<string> {
  const title = name.trim()
  const path = await availableTemplatePath(slugForTitle(title))
  await writeNote(path, `# ${title}\n`, generation)
  return path
}
