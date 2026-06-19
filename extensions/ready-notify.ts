import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const execFileAsync = promisify(execFile)

const TITLE = process.env.PI_NOTIFY_TITLE?.trim() || 'Pi'
const MESSAGE = process.env.PI_NOTIFY_MESSAGE?.trim() || 'Ready for input'

function isGhosttyContext() {
  const termProgram = process.env.TERM_PROGRAM?.toLowerCase() || ''

  return termProgram === 'ghostty'
}

function notifyOSC777(title: string, message: string) {
  process.stdout.write(`\x1b]777;notify;${title};${message}\x07`)
}

async function tryExec(file: string, args: string[]) {
  try {
    await execFileAsync(file, args, { timeout: 3_000, maxBuffer: 64 * 1024 })
    return true
  } catch {
    return false
  }
}

async function notifyDesktop(title: string, message: string) {
  if (process.platform === 'darwin') {
    void tryExec('afplay', [
      '/System/Library/PrivateFrameworks/ToneLibrary.framework/Versions/A/Resources/AlertTones/EncoreInfinitum/Cheers-EncoreInfinitum.caf',
    ])
    void tryExec('osascript', [
      '-e',
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ])
  }
}

export default function (pi: ExtensionAPI) {
  pi.on('agent_end', async _event => {
    if (isGhosttyContext()) {
      notifyOSC777(TITLE, MESSAGE)
      return
    }

    void notifyDesktop(TITLE, MESSAGE)
  })
}
