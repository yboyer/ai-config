import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

const execFileAsync = promisify(execFile)

const TITLE = process.env.PI_NOTIFY_TITLE?.trim() || 'Pi'
const MESSAGE = process.env.PI_NOTIFY_MESSAGE?.trim() || 'Ready for input'
const CHANNELS = new Set(
  (process.env.PI_NOTIFY_CHANNELS?.trim() || 'terminal,desktop,bell,sound')
    .split(',')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
)

function has(channel: 'terminal' | 'desktop' | 'bell' | 'sound') {
  return CHANNELS.has(channel)
}

function escapeOsc(text: string) {
  return text
    .replaceAll('\u0007', ' ')
    .replaceAll('\u001b', '')
    .replaceAll('\n', ' ')
    .replaceAll(';', ',')
}

async function tryExec(file: string, args: string[]) {
  try {
    await execFileAsync(file, args, { timeout: 3_000, maxBuffer: 64 * 1024 })
    return true
  } catch {
    return false
  }
}

function notifyTerminal(ctx: ExtensionContext, title: string, message: string) {
  if (ctx.hasUI) {
    ctx.ui.notify(`${title}: ${message}`, 'info')
    return
  }
  process.stdout.write(`\x1b]777;notify;${escapeOsc(title)};${escapeOsc(message)}\x07`)
}

function windowsToastScript(title: string, body: string): string {
  const type = 'Windows.UI.Notifications'
  return [
    `$mgr = [${type}.ToastNotificationManager, ${type}, ContentType = WindowsRuntime]`,
    `$xml = [${type}.ToastNotificationManager]::GetTemplateContent([${type}.ToastTemplateType]::ToastText02)`,
    `$xml.GetElementsByTagName('text')[0].AppendChild($xml.CreateTextNode(${JSON.stringify(title)})) > $null`,
    `$xml.GetElementsByTagName('text')[1].AppendChild($xml.CreateTextNode(${JSON.stringify(body)})) > $null`,
    `$toast = [${type}.ToastNotification]::new($xml)`,
    `[${type}.ToastNotificationManager]::CreateToastNotifier(${JSON.stringify(title)}).Show($toast)`,
  ].join('; ')
}

async function notifyDesktop(title: string, message: string) {
  if (process.platform === 'darwin') {
    return tryExec('osascript', [
      '-e',
      `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`,
    ])
  }

  if (process.platform === 'win32') {
    return tryExec('powershell.exe', ['-NoProfile', '-Command', windowsToastScript(title, message)])
  }

  return tryExec('notify-send', [title, message])
}

async function playSound() {
  if (process.platform === 'darwin') {
    if (await tryExec('afplay', ['/System/Library/Sounds/Funk.aiff'])) return true
    return tryExec('afplay', ['/System/Library/Sounds/Ping.aiff'])
  }

  if (process.platform === 'win32') {
    return tryExec('powershell.exe', [
      '-NoProfile',
      '-Command',
      '[System.Media.SystemSounds]::Asterisk.Play()',
    ])
  }

  if (await tryExec('paplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'])) return true
  if (await tryExec('aplay', ['/usr/share/sounds/freedesktop/stereo/complete.oga'])) return true
  return tryExec('play', ['/usr/share/sounds/freedesktop/stereo/complete.oga'])
}

export default function (pi: ExtensionAPI) {
  pi.on('agent_end', async (_event, ctx) => {
    if (has('terminal')) notifyTerminal(ctx, TITLE, MESSAGE)
    if (has('desktop')) void notifyDesktop(TITLE, MESSAGE)
    if (has('bell')) process.stdout.write('\x07')
    if (has('sound')) void playSound()
  })
}
