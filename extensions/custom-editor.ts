import type { ExtensionAPI, KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent'
import type { EditorTheme, TUI } from '@earendil-works/pi-tui'
import { CustomEditor } from '@earendil-works/pi-coding-agent'
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui'

type SessionState = {
  cwd: string
  model: string
  sessionName: string | undefined
  thinking: string
  theme?: Theme
}

const LINE = '─'

function fitBorder(
  left: string,
  right: string,
  width: number,
  border: (text: string) => string,
  fill: (text: string) => string = border
): string {
  if (width <= 0) return ''
  if (width === 1) return border('─')

  let leftText = left
  let rightText = right
  const fixedWidth = 2
  const minimumGap = 3

  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(rightText) > 0
  ) {
    rightText = truncateToWidth(rightText, Math.max(0, visibleWidth(rightText) - 1), '')
  }
  while (
    fixedWidth + visibleWidth(leftText) + visibleWidth(rightText) + minimumGap > width &&
    visibleWidth(leftText) > 0
  ) {
    leftText = truncateToWidth(leftText, Math.max(0, visibleWidth(leftText) - 1), '')
  }

  const gapWidth = Math.max(
    0,
    width - fixedWidth - visibleWidth(leftText) - visibleWidth(rightText)
  )
  return `${border('─')}${leftText}${fill('─'.repeat(gapWidth))}${rightText}${border('─')}`
}

class BorderStatusEditor extends CustomEditor {
  private formatInputWithCommandHighlight(paddingX: number, input: string): string {
    const commandMatch = input.match(/\s\/([\w:-]+)(.*)$/)
    if (!commandMatch) return input

    const command = `${' '.repeat(paddingX)}/${commandMatch[1]}`
    const rest = commandMatch[2]
    const styledCommand = this.sessionState.theme?.fg('accent', command) ?? command
    return `${styledCommand}${rest}`
  }

  constructor(
    tui: TUI,
    theme: EditorTheme,
    keybindings: KeybindingsManager,
    private sessionState: SessionState
  ) {
    super(tui, theme, keybindings)
    this.sessionState = sessionState
  }

  refresh() {
    this.tui.requestRender()
  }

  render(width: number): string[] {
    const lines = super.render(width)
    if (lines.length < 2) return lines

    // Style input line with command highlight
    const inputLineIdx = lines.findIndex(line => !line.includes(LINE) && line.trim().length > 0)
    if (inputLineIdx >= 0 && inputLineIdx < lines.length) {
      lines[inputLineIdx] = this.formatInputWithCommandHighlight(
        this.getPaddingX(),
        lines[inputLineIdx]
      )
    }

    const topLeft = this.borderColor(
      ` ${this.sessionState.model}${this.sessionState.thinking !== 'off' ? ` · ${this.sessionState.thinking}` : ''} `
    )
    const bottomLeft = ''
    const topRight = ''
    const bottomRight = ''

    lines[0] = fitBorder(topLeft, topRight, width, this.borderColor)
    lines.splice(1, 0, '')
    lines.splice(
      lines.findLastIndex(line => line.includes(LINE)),
      0,
      ''
    )
    lines.splice(
      lines.findLastIndex(line => line.includes(LINE)),
      1,
      fitBorder(bottomLeft, bottomRight, width, this.borderColor)
    )
    return lines
  }
}

export default function (pi: ExtensionAPI) {
  const sessionState: SessionState = {
    cwd: process.cwd(),
    model: 'no model',
    sessionName: undefined,
    thinking: 'off',
    theme: undefined,
  }

  let editor: BorderStatusEditor | undefined

  pi.on('model_select', event => {
    sessionState.model = event.model.id
    editor?.refresh()
  })

  pi.on('thinking_level_select', event => {
    sessionState.thinking = event.level
    editor?.refresh()
  })

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return

    sessionState.cwd = ctx.cwd
    sessionState.model = ctx.model?.id ?? 'no model'
    sessionState.sessionName = ctx.sessionManager.getSessionName()
    sessionState.thinking = pi.getThinkingLevel()
    sessionState.theme = ctx.ui.theme

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      if (editor) {
        editor.refresh()
        return editor
      }
      editor = new BorderStatusEditor(tui, theme, keybindings, sessionState)
      return editor
    })
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI) return
    ctx.ui.setEditorComponent(undefined)
  })
}
