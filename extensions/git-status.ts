import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent'

const execFileAsync = promisify(execFile)
const WIDGET_ID = 'yboyer-git-status'
const REFRESH_INTERVAL_MS = 2_000
const RESET = '\x1b[0m'
const COLORS: Record<string, Rgb> = {
  white: [171, 178, 191],
  added: [82, 215, 93],
  deleted: [224, 108, 116],
  modified: [97, 175, 238],
  renamed: [198, 119, 220],
  committable: [86, 182, 194],
  unstaged: [228, 192, 122],
}

type Rgb = [number, number, number]

function customFg([r, g, b]: Rgb, text: string) {
  return `\x1b[38;2;${r};${g};${b}m${text}${RESET}`
}

async function runGit(args: string[], cwd: string) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  })
  return stdout.trimEnd()
}

async function directoryExists(path: string) {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

async function getBranch(cwd: string) {
  const branch = await runGit(['branch', '--show-current'], cwd)
  if (branch.length > 0) return branch

  const head = await runGit(['rev-parse', '--short', 'HEAD'], cwd)
  return head.length > 0 ? `detached@${head}` : 'unknown'
}

async function getStatusSummary(cwd: string) {
  const [status, localCommit, remoteCommit, commonBase] = await Promise.all([
    runGit(['status', '--porcelain'], cwd),
    runGit(['rev-parse', '@'], cwd),
    runGit(['rev-parse', '@{u}'], cwd),
    runGit(['merge-base', '@', '@{u}'], cwd),
  ])

  const [rebaseMerge, rebaseApply] = await Promise.all([
    runGit(['rev-parse', '--git-path', 'rebase-merge'], cwd),
    runGit(['rev-parse', '--git-path', 'rebase-apply'], cwd),
  ])

  const [isRebaseMerge, isRebaseApply] = await Promise.all([
    directoryExists(rebaseMerge),
    directoryExists(rebaseApply),
  ])

  return formatStatusSummary(status, {
    commonBase,
    isRebaseApply,
    isRebaseMerge,
    localCommit,
    remoteCommit,
  })
}

function formatStatusSummary(
  statusOutput: string,
  gitState: {
    commonBase: string
    isRebaseApply: boolean
    isRebaseMerge: boolean
    localCommit: string
    remoteCommit: string
  }
) {
  let unstaged = 0
  let added = 0
  let deleted = 0
  let modified = 0
  let renamed = 0

  if (statusOutput.length > 0) {
    for (const line of statusOutput.split('\n')) {
      if (line.startsWith('??')) {
        unstaged += 1
        added += 1
        continue
      }

      const indexStatus = line[0]
      const worktreeStatus = line[1]

      if (indexStatus === ' ') unstaged += 1
      if (indexStatus === 'A') added += 1
      if (indexStatus === 'D' || worktreeStatus === 'D') deleted += 1
      if (indexStatus === 'M' || worktreeStatus === 'M') modified += 1
      if (indexStatus === 'R') renamed += 1
    }
  }

  const segments = []
  if (added > 0) segments.push(`${added}+`)
  if (deleted > 0) segments.push(`${deleted}-`)
  if (modified > 0) segments.push(`${modified}*`)
  if (renamed > 0) segments.push(`${renamed}>`)

  let remote: 'pull' | 'push' | 'both' | null = null
  const hasUpstream =
    !gitState.remoteCommit.includes('fatal:') &&
    !gitState.remoteCommit.includes('no upstream') &&
    !gitState.remoteCommit.includes('unknown revision') &&
    gitState.remoteCommit.length > 0

  if (hasUpstream && gitState.localCommit !== gitState.remoteCommit) {
    if (gitState.commonBase === gitState.remoteCommit) {
      remote = 'push'
    } else if (gitState.commonBase === gitState.localCommit) {
      remote = 'pull'
    } else {
      remote = 'both'
    }
  }

  const rebase = gitState.isRebaseMerge || gitState.isRebaseApply ? '\uE0A0' : null

  if (remote) segments.push(remote)
  if (rebase) segments.push(rebase)

  let committable: string | null = null
  if (statusOutput.length > 0) {
    committable = unstaged > 0 ? `${unstaged}⚡︎` : '✔'
    segments.push(committable)
  }

  return {
    added,
    committable,
    deleted,
    modified,
    remote,
    unstaged,
    rebase,
    renamed,
    summary: segments.join(' '),
  }
}

async function getGitStatusLine({ cwd, theme }: { cwd: string; theme: Theme }): Promise<string> {
  await runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  const [branch, statusSummary] = await Promise.all([getBranch(cwd), getStatusSummary(cwd)])

  const added = customFg(COLORS.added, statusSummary.added ? ` ${statusSummary.added}+` : '')
  const deleted = customFg(
    COLORS.deleted,
    statusSummary.deleted ? ` ${statusSummary.deleted}-` : ''
  )
  const modified = customFg(
    COLORS.modified,
    statusSummary.modified ? ` ${statusSummary.modified}*` : ''
  )
  const renamed = customFg(
    COLORS.renamed,
    statusSummary.renamed ? ` ${statusSummary.renamed}>` : ''
  )

  const committable = statusSummary.unstaged
    ? customFg(COLORS.unstaged, ` ${statusSummary.unstaged}⚡︎`)
    : customFg(COLORS.committable, ' ✔')

  let remote = ''
  switch (statusSummary.remote) {
    case 'push':
      remote = customFg(COLORS.white, ' ⇡')
      break
    case 'pull':
      remote = customFg(COLORS.white, ' ⇣')
      break
    case 'both':
      remote = customFg(COLORS.white, ' ⇣⇡')
      break
    default:
      remote = ''
  }
  const rebase = statusSummary.rebase ? customFg(COLORS.white, ` ${statusSummary.rebase}`) : ''

  return `${theme.fg('dim', '(')}${theme.fg('dim', branch)}${added}${deleted}${modified}${renamed}${theme.fg('dim', ')')}${committable}${remote}${rebase}`
}

async function refresh(ctx: ExtensionContext) {
  if (!ctx.hasUI) return

  try {
    const line = await getGitStatusLine({ cwd: ctx.cwd, theme: ctx.ui.theme })
    ctx.ui.setStatus(WIDGET_ID, line)
  } catch {
    ctx.ui.setStatus(WIDGET_ID, undefined)
  }
}

export default function (pi: ExtensionAPI) {
  let interval: NodeJS.Timeout | undefined

  pi.on('session_start', async (_event, ctx) => {
    if (interval) clearInterval(interval)

    await refresh(ctx)
    interval = setInterval(() => {
      void refresh(ctx)
    }, REFRESH_INTERVAL_MS)
  })

  pi.on('input', async (_event, ctx) => {
    await refresh(ctx)
  })

  pi.on('tool_execution_end', async (_event, ctx) => {
    await refresh(ctx)
  })

  pi.on('session_shutdown', async () => {
    if (interval) {
      clearInterval(interval)
      interval = undefined
    }
  })
}
