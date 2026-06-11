import path from 'node:path'

import type { ExtensionAPI, Theme } from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'
import { createBashTool, createReadTool } from '@earendil-works/pi-coding-agent'
import { Box, Image, Text, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

function toRelative(cwd: string, filePath: string) {
  const relative = path.relative(cwd, filePath)
  return `${relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : filePath}`
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

function renderCall(
  data: {
    name: string
    summary: string
  },
  theme: Theme,
  ctx: {
    isPartial: boolean
    isError: boolean
  }
): Component {
  const tool = theme.fg('toolTitle', theme.bold(data.name.toUpperCase()))

  const container = new Box(0, 0)

  const prefix = `${statusPrefix(theme, ctx)} ${tool} `

  container.addChild({
    invalidate: () => null,
    render(width) {
      return [truncateToWidth(`${prefix}${data.summary}`, width)]
    },
  })

  return container
}

export default function (pi: ExtensionAPI) {
  if (Math.random() < 1) {
    // return
  }
  const cwd = process.cwd()

  // --- Read tool: show path and line count ---
  const originalRead = createReadTool(cwd)
  pi.registerTool({
    ...originalRead,
    renderShell: 'self',
    renderCall(args, theme, ctx) {
      const tool = theme.fg('toolTitle', theme.bold('READ'))
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
          const truncatedPath = truncateFromStartToWidth(relativePath, pathWidth)

          return [`${prefix}${theme.fg('muted', truncatedPath)}${theme.fg('syntaxNumber', suffix)}`]
        },
      })

      return container
    },

    renderResult(result, { expanded, isPartial }, theme) {
      if (isPartial) return new Text(theme.fg('warning', 'Reading...'), 0, 0)

      const content = result.content[0]

      let text = ''

      if (expanded) {
        if (content.type === 'image') {
          return new Image(content.data, content.mimeType, {
            fallbackColor(str) {
              return theme.fg('dim', str)
            },
          })
        }

        const lines = content.text.split('\n').slice(0, 10)
        for (const line of lines) {
          text += `\n${theme.fg('dim', line)}`
        }
        const lineCount = content.text.split('\n').length
        if (lineCount > 10) {
          text += `\n${theme.fg('muted', `... ${lineCount - 10} more lines`)}`
        }
      }

      return new Text(text, 0, 0)
    },
  })

  // --- Bash tool: show command and exit code ---
  const originalBash = createBashTool(cwd)
  pi.registerTool({
    ...originalBash,
    renderShell: 'self',
    renderCall: (args, theme, ctx) =>
      renderCall(
        {
          name: 'bash',
          summary: theme.fg('muted', args.command.split('\n')[0]),
        },
        theme,
        ctx
      ),
    renderResult(result, { expanded }, theme, ctx) {
      let text = ''

      if (expanded) {
        const content = result.content[0]

        if (content.type === 'image') {
          return new Image(content.data, content.mimeType, {
            fallbackColor(str) {
              return theme.fg('dim', str)
            },
          })
        }

        const lines = content.text.split('\n').slice(0, 10)
        for (const line of lines) {
          text += `\n${theme.fg('dim', line)}`
        }
        const lineCount = content.text.split('\n').length
        if (lineCount > 10) {
          text += `\n${theme.fg('muted', `... ${lineCount - 10} more lines`)}`
        }
      }

      return new Text(text, 0, 0)
    },
  })

  // const originalEdit = createEditTool(cwd)
  // pi.registerTool({
  //   ...originalEdit,
  //   renderShell: 'self',
  //   renderCall: (args, theme, ctx) =>
  //     renderCall(
  //       {
  //         name: 'edit',
  //         summary: theme.fg('muted', toRelative(cwd, args.path)),
  //       },
  //       theme,
  //       ctx
  //     ),
  //   renderResult(result, { isPartial }, theme, ctx) {
  //     if (isPartial) return new Container()

  //     if (ctx.isError) {
  //       return new Text(
  //         theme.fg(
  //           'error',
  //           result.content
  //             .filter(c => c.type === 'text')
  //             .map(c => c.text || '')
  //             .join('\n')
  //         ),
  //         1,
  //         0
  //       )
  //     }

  //     // Count additions and removals from the diff
  //     const diffLines: string[] = result.details.diff.split('\n')

  //     const colorizedLines = diffLines.map(line => {
  //       if (line.startsWith('+') && !line.startsWith('+++')) {
  //         return `${theme.fg('success', line)}`
  //       }
  //       if (line.startsWith('-') && !line.startsWith('---')) {
  //         return `${theme.fg('error', line)}`
  //       }
  //       return `${theme.fg('dim', line)}`
  //     })

  //     return new Text(colorizedLines.join('\n'), 1, 0)
  //   },
  // })

  // const originalWrite = createWriteTool(cwd)
  // pi.registerTool({
  //   ...originalWrite,
  //   renderShell: 'self',
  //   // renderCall(args, theme) {
  //   //   let text = theme.fg('toolTitle', theme.bold('write '))
  //   //   text += theme.fg('accent', args.path)
  //   //   const lineCount = args.content.split('\n').length
  //   //   text += theme.fg('dim', ` (${lineCount} lines)`)
  //   //   return new Text(text, 0, 0)
  //   // },
  //   renderCall(args, theme, ctx) {
  //     const a = renderCall(
  //       {
  //         name: 'write',
  //         summary: theme.fg('muted', toRelative(cwd, args.path)),
  //       },
  //       theme,
  //       ctx
  //     )

  //     const box = new Box(0, 0)
  //     box.addChild(a)

  //     let text = ''

  //     const component = (ctx.lastComponent as Text) ?? new Text()

  //     const lang = getLanguageFromPath(ctx.args.path)
  //     const renderedLines = lang
  //       ? highlightCode(ctx.args.content.replace(/\t/g, '  ').replace(/\r/g, ''), lang)
  //       : ctx.args.content.replace(/\r/g, '').split('\n')

  //     // Trim trailing empty lines
  //     let end = renderedLines.length
  //     while (end > 0 && renderedLines[end - 1] === '') end--

  //     const lines = renderedLines.slice(0, end)
  //     const maxLines = ctx.expanded ? lines.length : 10
  //     const displayLines: string = lines
  //       .slice(0, maxLines)
  //       .map(line => (lang ? line : theme.fg('toolOutput', line.replace(/\t/g, '  '))))
  //       .join('\n')
  //     const remaining = lines.length - maxLines
  //     text += displayLines
  //     if (remaining > 0) {
  //       text += `${theme.fg('muted', `\n... (${remaining} more lines`)})`
  //     }

  //     component.setText(text)
  //     box.addChild(component)
  //     return box
  //   },

  //   // renderResult(result, { expanded }, theme, ctx) {
  //   //   if (ctx.isError) return new Container()

  //   //   function trimTrailingEmptyLines(lns: string[]) {
  //   //     let end = lns.length
  //   //     while (end > 0 && lns[end - 1] === '') {
  //   //       end--
  //   //     }
  //   //     return lns.slice(0, end)
  //   //   }

  //   //   if (ctx.isError) {
  //   //     return new Container()
  //   //   }

  //   //   const text = ''
  //   //   return new Container()

  //   //   // const component = ctx.lastComponent ?? new WriteCallRenderComponent()

  //   //   // const lang = getLanguageFromPath(ctx.args.path)
  //   //   // const renderedLines = lang
  //   //   //   ? highlightCode(ctx.args.content.replace(/\t/g, '  ').replace(/\r/g, ''), lang)
  //   //   //   : ctx.args.content.replace(/\r/g, '').split('\n')
  //   //   // const lines = trimTrailingEmptyLines(renderedLines)
  //   //   // const maxLines = expanded ? lines.length : 10
  //   //   // const displayLines: string[] = lines.slice(0, maxLines)
  //   //   // const remaining = lines.length - maxLines
  //   //   // text += `\n\n${displayLines.map(line => (lang ? line : theme.fg('toolOutput', line.replace(/\t/g, '  ')))).join('\n')}`
  //   //   // if (remaining > 0) {
  //   //   //   text += `${theme.fg('muted', `\n... (${remaining} more lines`)})`
  //   //   // }

  //   //   // component.setText(text)
  //   //   // return component
  //   // },
  // })
}
