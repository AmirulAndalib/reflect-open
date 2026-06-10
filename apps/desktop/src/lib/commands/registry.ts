import type { AppCommand, CommandContext } from './types'

/**
 * The command registry (Plan 08): a flat, collision-checked id → command map.
 * The palette lists it, the app keymap binds it, and deep links/CLI will look
 * commands up by id — one command system, not three.
 */

const commands = new Map<string, AppCommand>()

/** Register commands; duplicate ids are a programmer error and throw. */
export function registerCommands(definitions: AppCommand[]): void {
  for (const command of definitions) {
    if (commands.has(command.id)) {
      throw new Error(`command id already registered: ${command.id}`)
    }
    commands.set(command.id, command)
  }
}

/** Every registered command, in registration order. */
export function listCommands(): AppCommand[] {
  return [...commands.values()]
}

/** Run a command by id; unknown ids are a loud no-op (deep links may dangle). */
export async function runCommand(id: string, context: CommandContext): Promise<void> {
  const command = commands.get(id)
  if (!command) {
    console.error(`unknown command: ${id}`)
    return
  }
  await command.run(context)
}

/** Test seam. */
export function resetCommands(): void {
  commands.clear()
}
