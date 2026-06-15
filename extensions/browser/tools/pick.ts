#!/usr/bin/env node

/** biome-ignore-all lint/suspicious/noConsole: This script is intended to be run from command line and uses console.log for user feedback. */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

import puppeteer from 'puppeteer-core'

const message = process.argv.slice(2).join(' ')
if (!message) {
  console.log("Usage: pick.ts 'message'")
  console.log('\nExample:')
  console.log('  pick.ts "Click submit button"')
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

await p.bringToFront()

await p.evaluate(() => {
  window.pick = async message => {
    if (!message) {
      throw new Error('pick() requires message parameter')
    }

    return new Promise(resolve => {
      const selections = []
      const selectedElements = new Set()
      let pickCounter = 0

      const overlay = document.createElement('div')
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none'

      const highlight = document.createElement('div')
      highlight.style.cssText = `position:absolute;
        border:2px solid rgba(107,114,128,0.95);
        background:rgba(156,163,175,0.10);
        border-radius:2px`
      overlay.appendChild(highlight)

      const hoverCard = document.createElement('div')
      hoverCard.style.cssText = `position:fixed;
        top:0;
        left:0;
        max-width:min(320px,calc(100vw - 14px));
        background:rgba(75,85,99,0.98);
        color:#fff;
        border:1px solid rgba(107,114,128,1);
        border-radius:4px;
        padding:4px 6px;
        font:10px sans-serif;
        white-space:nowrap;
        display:none;
        align-items:center;
        gap:6px`
      overlay.appendChild(hoverCard)

      const banner = document.createElement('div')
      banner.style.cssText = `position:fixed;
        bottom:20px;
        left:50%;
        transform:translateX(-50%);
        background:#1f2937;
        color:white;
        padding:12px 24px;
        border-radius:8px;
        font:10px sans-serif;
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        pointer-events:auto;
        z-index:2147483647`

      const updateBanner = () => {
        banner.textContent = `${message} (${selections.length} selected, Cmd/Ctrl+click to add, Enter to finish, ESC to cancel)`
      }
      updateBanner()

      document.body.append(banner, overlay)

      const cleanup = () => {
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKey, true)
        overlay.remove()
        banner.remove()
        selectedElements.forEach(el => {
          el.style.outline = ''
        })
      }

      const updateHoverCard = (el, rect) => {
        const elementName = formatElementName(el)
        const top = Math.round(rect.top)
        const left = Math.round(rect.left)
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)

        hoverCard.innerHTML = `
          <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:600;color:#f3f4f6;flex:1 1 auto">${elementName}</div>
          <div style="font-size:12px;font-weight:400;color:#e5e7eb;flex:0 0 auto">${width} × ${height}</div>
        `
        hoverCard.style.display = 'flex'
        hoverCard.style.visibility = 'hidden'

        const cardRect = hoverCard.getBoundingClientRect()
        const margin = 8
        const offset = 2
        let cardTop = top - cardRect.height - offset
        if (cardTop < margin) {
          cardTop = Math.min(window.innerHeight - cardRect.height - margin, top + height + offset)
        }

        let cardLeft = left
        if (cardLeft + cardRect.width > window.innerWidth - margin) {
          cardLeft = window.innerWidth - cardRect.width - margin
        }
        if (cardLeft < margin) cardLeft = margin

        hoverCard.style.top = `${cardTop}px`
        hoverCard.style.left = `${cardLeft}px`
        hoverCard.style.visibility = 'visible'
      }

      const onMove = e => {
        const el = document.elementFromPoint(e.clientX, e.clientY)
        if (!el || overlay.contains(el) || banner.contains(el)) return
        const r = el.getBoundingClientRect()
        highlight.style.top = `${r.top}px`
        highlight.style.left = `${r.left}px`
        highlight.style.width = `${r.width}px`
        highlight.style.height = `${r.height}px`
        updateHoverCard(el, r)
      }

      const ensurePickId = el => {
        const existing = el.getAttribute('data-pi-pick-id')
        if (existing) return existing
        pickCounter += 1
        const pickId = `pi-pick-${Date.now()}-${pickCounter}`
        el.setAttribute('data-pi-pick-id', pickId)
        return pickId
      }

      const formatElementName = el => {
        const tag = el.tagName.toLowerCase()
        const id = el.id ? `#${el.id}` : ''
        const classes = el.classList.length > 0 ? `.${Array.from(el.classList).join('.')}` : ''
        return `${tag}${id}${classes}`
      }

      const formatHtmlPath = el => {
        const parts = []
        let current = el
        while (current && current !== document.body) {
          parts.unshift(formatElementName(current))
          current = current.parentElement
        }
        return parts.join(' > ')
      }

      const collectRuleBlocks = (target, mode) => {
        const blocks = []
        const seen = new Set()
        const keepDirect = new Set([
          'box-sizing',
          'border',
          'border-width',
          'border-style',
          'border-color',
          'margin',
          'padding',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
          'display',
          'color',
          'font-family',
          'font-feature-settings',
          'tab-size',
        ])
        const keepInherited = new Set([
          'color',
          'font-family',
          'font-feature-settings',
          'font-size',
          'font-weight',
          'line-height',
          'letter-spacing',
          'tab-size',
        ])

        const shouldKeep = name =>
          mode === 'direct' ? keepDirect.has(name) : keepInherited.has(name)

        const getDeclarations = style => {
          const text = style.cssText || ''
          const parts = text
            .split(/;(?![^()]*\))/)
            .map(part => part.trim())
            .filter(Boolean)

          const normal = []
          const custom = []

          for (const part of parts) {
            const colon = part.indexOf(':')
            if (colon === -1) continue
            const name = part.slice(0, colon).trim().toLowerCase()
            if (name.startsWith('--')) {
              custom.push(part)
            } else if (shouldKeep(name)) {
              normal.push(part)
            }
          }

          return normal.length > 0 ? [...custom, ...normal] : []
        }

        const walkRules = rules => {
          for (const rule of Array.from(rules || [])) {
            if ('cssRules' in rule) {
              try {
                walkRules(rule.cssRules)
              } catch {
                // Ignore inaccessible nested rules.
              }
            }

            if (rule.type !== CSSRule.STYLE_RULE) continue

            const selector = rule.selectorText
            if (!selector) continue

            try {
              if (!target.matches(selector)) continue
            } catch {
              continue
            }

            const declarations = getDeclarations(rule.style)
            if (declarations.length === 0) continue

            const block = `${selector} { ${declarations.join('; ')} }`
            if (seen.has(block)) continue
            seen.add(block)
            blocks.push(block)
          }
        }

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            walkRules(sheet.cssRules)
          } catch {
            // Ignore inaccessible stylesheets.
          }
        }

        return blocks
      }

      const collectCssVariables = (sections, computedStyle) => {
        const ordered = []
        const seen = new Set()

        const add = name => {
          if (!name || seen.has(name)) return
          seen.add(name)
          ordered.push(name)
        }

        for (const section of sections) {
          for (const line of section) {
            const decls = line.match(/--[A-Za-z0-9_-]+|var\((--[A-Za-z0-9_-]+)/g) || []
            for (const decl of decls) {
              if (decl.startsWith('var(')) {
                add(decl.slice(4))
              } else {
                add(decl)
              }
            }
          }
        }

        return ordered
          .map(name => {
            const value = computedStyle.getPropertyValue(name).trim()
            return value ? `${name}: ${value};` : null
          })
          .filter(Boolean)
      }

      const buildElementInfo = el => {
        const computed = getComputedStyle(el)
        const rect = el.getBoundingClientRect()
        const pickId = ensurePickId(el)

        const directRules = collectRuleBlocks(el, 'direct')
        const inheritedRules = []
        const inheritedSeen = new Set()

        let current = el.parentElement
        while (current) {
          const rules = collectRuleBlocks(current, 'inherited')
          for (const rule of rules) {
            if (inheritedSeen.has(rule)) continue
            inheritedSeen.add(rule)
            inheritedRules.push(rule)
          }
          current = current.parentElement
        }

        const resolvedProps = [
          'margin',
          'padding',
          'border',
          'box-sizing',
          'color',
          'display',
          'font-family',
          'font-feature-settings',
          'font-size',
          'font-weight',
          'height',
          'letter-spacing',
          'line-height',
          'margin-block-end',
          'margin-block-start',
          'margin-inline-end',
          'margin-inline-start',
          'tab-size',
          'unicode-bidi',
          'width',
        ]

        const resolvedValues = resolvedProps.map(
          name => `${name}: ${computed.getPropertyValue(name)};`
        )
        const cssVariables = collectCssVariables([directRules, inheritedRules], computed)

        const cssSections = [...directRules]
        if (inheritedRules.length > 0) {
          if (cssSections.length > 0) cssSections.push('')
          cssSections.push('/* Inherited */')
          cssSections.push(...inheritedRules)
        }
        if (resolvedValues.length > 0) {
          if (cssSections.length > 0) cssSections.push('')
          cssSections.push('/* Resolved values */')
          cssSections.push(...resolvedValues)
        }
        if (cssVariables.length > 0) {
          if (cssSections.length > 0) cssSections.push('')
          cssSections.push('/* CSS variables */')
          cssSections.push(...cssVariables)
        }

        const outerClone = el.cloneNode(true)
        if (outerClone instanceof Element) {
          outerClone.removeAttribute('data-pi-pick-id')
        }

        return {
          pickId,
          element: formatElementName(el),
          url: location.href,
          htmlPath: formatHtmlPath(el),
          outerHTML: outerClone instanceof Element ? outerClone.outerHTML : el.outerHTML,
          dimensions: {
            top: `${Math.round(rect.top)}px`,
            left: `${Math.round(rect.left)}px`,
            width: `${Math.round(rect.width)}px`,
            height: `${Math.round(rect.height)}px`,
          },
          css: cssSections.join('\n'),
        }
      }

      const onClick = e => {
        if (banner.contains(e.target)) return
        e.preventDefault()
        e.stopPropagation()
        const el = document.elementFromPoint(e.clientX, e.clientY)
        if (!el || overlay.contains(el) || banner.contains(el)) return

        const info = buildElementInfo(el)

        if (e.metaKey || e.ctrlKey) {
          if (!selectedElements.has(el)) {
            selectedElements.add(el)
            el.style.outline = '3px solid rgba(107,114,128,0.95)'
            selections.push(info)
            updateBanner()
          }
        } else {
          cleanup()
          resolve(selections.length > 0 ? selections : info)
        }
      }

      const onKey = e => {
        if (e.key === 'Escape') {
          e.preventDefault()
          cleanup()
          resolve(null)
        } else if (e.key === 'Enter' && selections.length > 0) {
          e.preventDefault()
          cleanup()
          resolve(selections)
        }
      }

      document.addEventListener('mousemove', onMove, true)
      document.addEventListener('click', onClick, true)
      document.addEventListener('keydown', onKey, true)
    })
  }
})

const result = await p.evaluate(msg => window.pick(msg), message)

const screenshotElement = async (pickId, index) => {
  if (!pickId) return null

  const handle = await p.$(`[data-pi-pick-id="${pickId}"]`)
  if (!handle) return null

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filepath = join(tmpdir(), `pick-${timestamp}-${index + 1}.png`)
  await handle.screenshot({ path: filepath })
  await handle.dispose()
  return filepath
}

const clearPickIds = async () => {
  await p.evaluate(() => {
    for (const el of document.querySelectorAll('[data-pi-pick-id]')) {
      el.removeAttribute('data-pi-pick-id')
    }
  })
}

const attachScreenshots = async value => {
  if (!value || typeof value !== 'object') {
    await clearPickIds()
    return value
  }

  const items = Array.isArray(value) ? value : [value]

  try {
    for (const [index, item] of items.entries()) {
      item.screenshotPath = await screenshotElement(item.pickId, index)
    }

    return Array.isArray(value) ? items : items[0]
  } finally {
    await clearPickIds()
  }
}

const enrichedResult = await attachScreenshots(result)

const formatResult = info => {
  const parts = [
    'Attached Element Context from Integrated Browser',
    '',
    `Element: ${info.element}`,
    '',
    `URL: ${info.url}`,
    '',
    `HTML Path: ${info.htmlPath}`,
    '',
    'Outer HTML:',
    '```html',
    info.outerHTML,
    '```',
    '',
    'Dimensions:',
    `- top: ${info.dimensions.top}`,
    `- left: ${info.dimensions.left}`,
    `- width: ${info.dimensions.width}`,
    `- height: ${info.dimensions.height}`,
    '',
    `Screenshot Path: ${info.screenshotPath ?? 'null'}`,
    '',
    'CSS:',
    '```css',
    info.css,
    '```',
  ]

  return parts.join('\n')
}

if (Array.isArray(enrichedResult)) {
  console.log(enrichedResult.map(formatResult).join('\n\n---\n\n'))
} else if (typeof enrichedResult === 'object' && enrichedResult !== null) {
  console.log(formatResult(enrichedResult))
} else {
  console.log(enrichedResult)
}

await b.disconnect()
