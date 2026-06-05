import path from 'node:path'

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

const INTERVAL = 50
const FRAMES = [
  '⠁',
  '⠂',
  '⠄',
  '⡀',
  '⡈',
  '⡐',
  '⡠',
  '⣀',
  '⣁',
  '⣂',
  '⣄',
  '⣌',
  '⣔',
  '⣤',
  '⣥',
  '⣦',
  '⣮',
  '⣶',
  '⣷',
  '⣿',
  '⡿',
  '⠿',
  '⢟',
  '⠟',
  '⡛',
  '⠛',
  '⠫',
  '⢋',
  '⠋',
  '⠍',
  '⡉',
  '⠉',
  '⠑',
  '⠡',
  '⢁',
]

function getBaseTitle(pi: ExtensionAPI): string {
  const cwd = path.basename(process.cwd())
  const session = pi.getSessionName()
  return session ? `π - ${session} - ${cwd}` : `π - ${cwd}`
}

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | null = null
  let frameIndex = 0

  function stopAnimation(ctx: ExtensionContext) {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    frameIndex = 0
    ctx.ui.setTitle(getBaseTitle(pi))
  }

  function startAnimation(ctx: ExtensionContext) {
    stopAnimation(ctx)
    timer = setInterval(() => {
      const frame = FRAMES[frameIndex % FRAMES.length]
      const cwd = path.basename(process.cwd())
      const session = pi.getSessionName()
      const title = session ? `${frame} π - ${session} - ${cwd}` : `${frame} π - ${cwd}`
      ctx.ui.setTitle(title)
      frameIndex++
    }, INTERVAL)
  }

  pi.on('agent_start', async (_event, ctx) => {
    startAnimation(ctx)
  })

  pi.on('agent_end', async (_event, ctx) => {
    stopAnimation(ctx)
  })

  pi.on('session_shutdown', async (_event, ctx) => {
    stopAnimation(ctx)
  })

  pi.on('session_start', async (_event, ctx) => {
    ctx.ui.setWorkingIndicator({
      frames: FRAMES.map(frame => ctx.ui.theme.fg('accent', frame)),
      intervalMs: INTERVAL,
    })
  })
}
