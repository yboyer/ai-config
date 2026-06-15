#!/usr/bin/env node

/** biome-ignore-all lint/suspicious/noConsole: This script is intended to be run from the command line and uses console.log for user feedback. */

import puppeteer from 'puppeteer-core'

const code = process.argv.slice(2).join(' ')
if (!code) {
  console.log("Usage: eval.ts 'code'")
  console.log('\nExamples:')
  console.log('  eval.ts "document.title"')
  console.log('  eval.ts "document.querySelectorAll(\'a\').length"')
  process.exit(1)
}

const b = await puppeteer.connect({
  browserURL: 'http://localhost:9222',
  defaultViewport: null,
})

const p = (await b.pages()).at(-1)

if (!p) {
  console.error('✗ No active tab found')
  process.exit(1)
}

const result = await p.evaluate(c => {
  const AsyncFunction = (async () => {}).constructor
  return new AsyncFunction(`return (${c})`)()
}, code)

if (Array.isArray(result)) {
  for (let i = 0; i < result.length; i++) {
    if (i > 0) console.log('')
    for (const [key, value] of Object.entries(result[i])) {
      console.log(`${key}: ${value}`)
    }
  }
} else if (typeof result === 'object' && result !== null) {
  for (const [key, value] of Object.entries(result)) {
    console.log(`${key}: ${value}`)
  }
} else {
  console.log(result)
}

await b.disconnect()
