#!/usr/bin/env node

/** biome-ignore-all lint/suspicious/noConsole: This script is intended to be run from command line and uses console.log for user feedback. */

import { execFileSync, execSync, spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

export interface StartBrowserOptions {
  useProfile?: boolean
}

const scriptPath = fileURLToPath(import.meta.url)
const scriptDir = dirname(scriptPath)

function findChromeForTestingBinary() {
  try {
    const matches = execFileSync(
      '/usr/bin/find',
      [
        join(scriptDir, 'chrome'),
        '-type',
        'f',
        '-path',
        '*Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    )
      .trim()
      .split('\n')
      .filter(Boolean)

    return matches[0] ?? null
  } catch {
    return null
  }
}

function ensureChromeForTestingInstalled() {
  const existingBinary = findChromeForTestingBinary()
  if (existingBinary) {
    return existingBinary
  }

  execSync('npx -y @puppeteer/browsers install chrome@stable', {
    stdio: 'inherit',
    cwd: scriptDir,
  })

  const installedBinary = findChromeForTestingBinary()
  if (!installedBinary) {
    throw new Error('Google for Testing not found in ./chrome')
  }

  return installedBinary
}

function hasChromeProcess(bin: string) {
  try {
    execSync(`pgrep -f ${JSON.stringify(bin)}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function getDebugPortPids() {
  try {
    return execSync('lsof -ti tcp:9222', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n')
      .filter(Boolean)
  } catch {
    return []
  }
}

function killExistingChrome(bin: string) {
  try {
    execSync(`pkill -f ${JSON.stringify(bin)}`, { stdio: 'ignore' })
  } catch {
    // Ignore when no matching process exists.
  }

  const pids = getDebugPortPids()
  if (pids.length > 0) {
    try {
      execSync(`kill ${pids.join(' ')}`, { stdio: 'ignore' })
    } catch {
      // Ignore kill race.
    }
  }
}

async function waitForChromeShutdown(bin: string) {
  for (let i = 0; i < 40; i++) {
    if (!hasChromeProcess(bin) && getDebugPortPids().length === 0) {
      return
    }
    await new Promise(r => setTimeout(r, 250))
  }

  throw new Error('Failed to stop existing Chrome on :9222')
}

function parseArgs(argv: string[]) {
  const useProfile = argv[0] === '--profile'

  if (argv[0] && argv[0] !== '--profile') {
    throw new Error('Usage: start.ts [--profile]')
  }

  return { useProfile }
}

function isMainModule() {
  return Boolean(process.argv[1] && resolve(process.argv[1]) === scriptPath)
}

export async function startBrowser(options: StartBrowserOptions = {}) {
  const useProfile = options.useProfile === true
  const chromeBinary = ensureChromeForTestingInstalled()

  killExistingChrome(chromeBinary)
  await waitForChromeShutdown(chromeBinary)

  const userDataDir = join(process.env.HOME!, '.cache/browser-tools-ai')

  execSync(`mkdir -p ${userDataDir}`, { stdio: 'ignore' })

  if (useProfile) {
    execSync(
      `rsync -a --delete "${process.env.HOME}/Library/Application Support/Google/Chrome/" ${userDataDir}/`,
      { stdio: 'pipe' }
    )

    execSync(
      `find ${userDataDir} \
        \\( -type d -name Sessions -prune -exec rm -rf {} + \\) -o \
        \\( -type f \\( -name "Current Session" -o -name "Current Tabs" -o -name "Last Session" -o -name "Last Tabs" \\) -delete \\)`,
      { stdio: 'ignore', shell: '/bin/bash' }
    )
  }

  spawn(
    chromeBinary,
    ['--remote-debugging-port=9222', useProfile ? `--user-data-dir=${userDataDir}` : null].filter(
      el => el !== null
    ),
    {
      detached: true,
      stdio: 'ignore',
    }
  ).unref()

  let connected = false
  for (let i = 0; i < 30; i++) {
    try {
      const browser = await puppeteer.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      })
      await browser.disconnect()
      connected = true
      break
    } catch {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  if (!connected) {
    throw new Error('Failed to connect to Chrome')
  }

  return `✓ Google for Testing started on :9222${useProfile ? ' with your profile' : ''}`
}

export async function main(argv = process.argv.slice(2)) {
  const { useProfile } = parseArgs(argv)
  const result = await startBrowser({ useProfile })
  console.log(result)
}

if (isMainModule()) {
  try {
    await main()
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
