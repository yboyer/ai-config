import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { DEFAULT_PICK_MESSAGE, pickFromBrowser } from './tools/pick.ts'
import { startBrowser } from './tools/start.ts'

const BROWSER_STATUS_KEY = 'browser'
const BROWSER_WIDGET_KEY = 'browser-pick'
const PICK_SEPARATOR = '\n\n---\n\n'

function getUsage() {
  return [
    'Usage: /browser <start|pick> [args]',
    '',
    'Examples:',
    '  /browser start',
    '  /browser start --profile',
    '  /browser pick',
    '  /browser pick Pick CTA button',
  ].join('\n')
}

function isBrowserUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)

  return /9222|ECONNREFUSED|ERR_CONNECTION_REFUSED|webSocket URL|fetch/i.test(message)
}

function appendPickToDraft(ctx: ExtensionCommandContext, pickResult: string) {
  const currentDraft = ctx.ui.getEditorText().trimEnd()
  const nextDraft = currentDraft ? `${currentDraft}${PICK_SEPARATOR}${pickResult}` : pickResult

  ctx.ui.setEditorText(nextDraft)
}

async function handleStart(ctx: ExtensionCommandContext, useProfile: boolean) {
  ctx.ui.setStatus(
    BROWSER_STATUS_KEY,
    useProfile ? 'browser: starting with profile…' : 'browser: starting…'
  )

  try {
    const result = await startBrowser({ useProfile })
    ctx.ui.notify(result, 'info')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    ctx.ui.notify(`Browser start failed: ${message}`, 'error')
  } finally {
    ctx.ui.setStatus(BROWSER_STATUS_KEY, undefined)
  }
}

async function handlePick(ctx: ExtensionCommandContext, rawMessage: string) {
  if (!ctx.hasUI) {
    return
  }

  const message = rawMessage.trim() || DEFAULT_PICK_MESSAGE

  ctx.ui.setStatus(BROWSER_STATUS_KEY, 'browser: waiting for pick…')
  ctx.ui.setWidget(BROWSER_WIDGET_KEY, [
    'Browser pick active',
    `Prompt: ${message}`,
    'Chrome: click = pick, Cmd/Ctrl+click = multi-pick, Enter = finish, Esc = cancel',
  ])

  try {
    const result = await pickFromBrowser(message)

    if (result === null) {
      ctx.ui.notify('Browser pick cancelled', 'info')
      return
    }

    appendPickToDraft(ctx, result)
    ctx.ui.notify('Browser pick injected into draft. Edit, then send.', 'info')
  } catch (error) {
    if (isBrowserUnavailableError(error)) {
      ctx.ui.notify('Chrome not running. Run `/browser start` first.', 'error')
      return
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    ctx.ui.notify(`Browser pick failed: ${errorMessage}`, 'error')
  } finally {
    ctx.ui.setStatus(BROWSER_STATUS_KEY, undefined)
    ctx.ui.setWidget(BROWSER_WIDGET_KEY, undefined)
  }
}

function parseCommandArgs(args: string) {
  const trimmed = args.trim()
  if (!trimmed) {
    return { subcommand: '', rest: '' }
  }

  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace === -1) {
    return { subcommand: trimmed, rest: '' }
  }

  return {
    subcommand: trimmed.slice(0, firstSpace),
    rest: trimmed.slice(firstSpace + 1).trim(),
  }
}

async function showMenu(ctx: ExtensionCommandContext) {
  const choice = await ctx.ui.select('Browser', ['start', 'start --profile', 'pick'])

  if (!choice) {
    return
  }

  if (choice === 'start') {
    await handleStart(ctx, false)
    return
  }

  if (choice === 'start --profile') {
    await handleStart(ctx, true)
    return
  }

  await handlePick(ctx, '')
}

export default function browserExtension(pi: ExtensionAPI) {
  pi.registerCommand('browser', {
    description: 'Start browser or pick DOM context into draft',
    getArgumentCompletions(prefix) {
      const trimmedLeft = prefix.trimStart()

      if (!trimmedLeft.includes(' ')) {
        const items = ['start', 'pick']
          .filter(item => item.startsWith(trimmedLeft))
          .map(item => ({ value: item, label: item }))

        return items.length > 0 ? items : null
      }

      const [subcommand, partial = ''] = trimmedLeft.split(/\s+/, 2)
      if (subcommand !== 'start') {
        return null
      }

      const items = ['--profile']
        .filter(item => item.startsWith(partial))
        .map(item => ({ value: `start ${item}`, label: item }))

      return items.length > 0 ? items : null
    },
    async handler(args, ctx) {
      const { subcommand, rest } = parseCommandArgs(args)

      if (!subcommand) {
        if (ctx.hasUI) {
          await showMenu(ctx)
        } else {
          ctx.ui.notify(getUsage(), 'info')
        }
        return
      }

      if (subcommand === 'start') {
        if (rest && rest !== '--profile') {
          ctx.ui.notify(getUsage(), 'error')
          return
        }

        await handleStart(ctx, rest === '--profile')
        return
      }

      if (subcommand === 'pick') {
        await handlePick(ctx, rest)
        return
      }

      ctx.ui.notify(getUsage(), 'error')
    },
  })
}
