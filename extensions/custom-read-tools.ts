import path from 'node:path'

import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent'
import { createReadTool } from '@earendil-works/pi-coding-agent'
import { Box, Container, hyperlink, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

function toRelative(cwd: string, filePath: string) {
  const relative = path.relative(cwd, filePath)
  return `${relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : filePath}`
}

function toAbsolute(cwd: string, filePath: string) {
  if (path.isAbsolute(filePath)) return filePath
  return path.join(cwd, filePath)
}

function statusPrefix(theme: Theme, state: { isError: boolean; isPartial: boolean }) {
  if (state.isError) {
    return theme.fg('error', '✗')
  }
  if (state.isPartial) {
    return theme.fg('warning', '…')
  }
  return theme.fg('success', '✓')
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function truncateFromStartToWidth(text: string, maxWidth: number, ellipsis = '...') {
  if (maxWidth <= 0) return ''

  const textWidth = visibleWidth(text)
  if (textWidth <= maxWidth) return text

  const ellipsisWidth = visibleWidth(ellipsis)
  if (ellipsisWidth >= maxWidth) {
    return truncateToWidth(ellipsis, maxWidth, '')
  }

  const segments = Array.from(graphemeSegmenter.segment(text), part => part.segment)
  const targetWidth = maxWidth - ellipsisWidth
  let tail = ''
  let tailWidth = 0

  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]!
    const segmentWidth = visibleWidth(segment)
    if (tailWidth + segmentWidth > targetWidth) break
    tail = `${segment}${tail}`
    tailWidth += segmentWidth
  }

  return `${ellipsis}${tail}`
}

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd()

  const originalRead = createReadTool(cwd)
  pi.registerTool({
    ...originalRead,
    renderShell: 'self',
    renderCall(args, theme, ctx) {
      const tool = theme.fg('dim', theme.bold('READ'))
      const prefix = `${statusPrefix(theme, ctx)} ${tool} `
      const prefixWidth = visibleWidth(prefix)

      const relativePath = toRelative(cwd, args.path)
      const suffix = `${args.offset ? `:${args.offset}` : ''}${args.limit ? `-${args.limit}` : ''}`

      const container = new Box(0, 0)
      container.addChild({
        invalidate: () => null,
        render(width) {
          const availableWidth = width - prefixWidth
          const suffixWidth = visibleWidth(suffix)

          const pathWidth = availableWidth - suffixWidth
          const truncatedPath = hyperlink(
            truncateFromStartToWidth(relativePath, pathWidth),
            `file://${toAbsolute(cwd, args.path)}`
          )

          return [`${prefix}${theme.fg('dim', truncatedPath)}${theme.fg('dim', suffix)}`]
        },
      })

      return container
    },

    renderResult() {
      return new Container()
    },
  })
}
