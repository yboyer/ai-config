import { readFileSync } from 'node:fs'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const PROMPT = readFileSync(
  new URL('../../system-prompts/concise-mode.md', import.meta.url),
  'utf8'
).trim()

export default function promptCustomizer(pi: ExtensionAPI) {
  pi.on('before_agent_start', async event => {
    return {
      systemPrompt: `${event.systemPrompt}\n\n${PROMPT}`,
    }
  })
}
