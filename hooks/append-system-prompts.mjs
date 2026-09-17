import { readFile } from 'node:fs/promises'

const prompts = await Promise.all(
  ['concise-mode.md', 'intent-clarifier.md'].map(file =>
    readFile(new URL(`../system-prompts/${file}`, import.meta.url), 'utf8')
  )
)

process.stdout.write(
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: prompts.map(prompt => prompt.trim()).join('\n\n'),
    },
  })}\n`
)
