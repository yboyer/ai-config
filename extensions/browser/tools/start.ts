#!/usr/bin/env node

/** biome-ignore-all lint/suspicious/noConsole: This script is intended to be run from the command line and uses console.log for user feedback. */

import { execFileSync, execSync, spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import puppeteer from 'puppeteer-core'

const useProfile = process.argv[2] === '--profile'

if (process.argv[2] && process.argv[2] !== '--profile') {
  console.log('Usage: start.ts [--profile]')
  console.log('\nOptions:')
  console.log('  --profile  Copy your default Chrome profile (cookies, logins)')
  console.log('\nExamples:')
  console.log('  start.ts            # Start with fresh profile')
  console.log('  start.ts --profile  # Start with your Chrome profile')
  process.exit(1)
}

const scriptDir = dirname(fileURLToPath(import.meta.url))

execSync('npx -y @puppeteer/browsers install chrome@stable', {
  stdio: 'inherit',
  cwd: scriptDir,
})

function resolveChromeForTestingBinary() {
  const matches = execFileSync(
    '/usr/bin/find',
    [
      join(scriptDir, 'chrome'),
      '-type',
      'f',
      '-path',
      '*Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    ],
    { encoding: 'utf8' }
  )
    .trim()
    .split('\n')
    .filter(Boolean)

  const binary = matches[0]

  if (!binary) {
    console.error('✗ Google for Testing not found in ./chrome')
    console.error('  Run: npx @puppeteer/browsers -y install chrome@stable')
    process.exit(1)
  }

  return binary
}

const chromeBinary = resolveChromeForTestingBinary()

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

  console.error('✗ Failed to stop existing Chrome on :9222')
  process.exit(1)
}

killExistingChrome(chromeBinary)
await waitForChromeShutdown(chromeBinary)

const userDataDir = join(process.env.HOME!, '.cache/browser-tools-ai')

// Setup profile directory
execSync(`mkdir -p ${userDataDir}`, { stdio: 'ignore' })

if (useProfile) {
  // Sync profile with rsync (much faster on subsequent runs)
  execSync(
    `rsync -a --delete "${process.env.HOME}/Library/Application Support/Google/Chrome/" ${userDataDir}/`,
    { stdio: 'pipe' }
  )

  // Remove session restore data so old tabs/windows are not reopened
  execSync(
    `find ${userDataDir} \
      \\( -type d -name Sessions -prune -exec rm -rf {} + \\) -o \
      \\( -type f \\( -name "Current Session" -o -name "Current Tabs" -o -name "Last Session" -o -name "Last Tabs" \\) -delete \\)`,
    { stdio: 'ignore', shell: '/bin/bash' }
  )
}

// Start Chrome in background (detached so Node can exit)
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

// Wait for Chrome to be ready by attempting to connect
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
  console.error('✗ Failed to connect to Chrome')
  process.exit(1)
}

console.log(`✓ Google for Testing started on :9222${useProfile ? ' with your profile' : ''}`)
