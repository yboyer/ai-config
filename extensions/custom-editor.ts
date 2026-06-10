import type { Model } from '@earendil-works/pi-ai'
import type {
  ExtensionAPI,
  ExtensionContext,
  KeybindingsManager,
  Theme,
} from '@earendil-works/pi-coding-agent'
import type { EditorTheme, TUI } from '@earendil-works/pi-tui'
import { CustomEditor } from '@earendil-works/pi-coding-agent'
import { visibleWidth } from '@earendil-works/pi-tui'

function colorBg(rgb: [number, number, number], text: string): string {
  const bg = `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
  const reset = '\x1b[0m'
  const keepBgAcrossResets = text.split(reset).join(`${reset}${bg}`)
  return `${bg}${keepBgAcrossResets}${reset}`
}

class BorderStatusEditor extends CustomEditor {
  private prefix = '▎ '
  private suffix = ' '
  private borderPart = '─'
  model: Pick<Model<'any'>, 'name' | 'provider'> = {
    name: '',
    provider: '',
  }
  thinking: string = 'off'
  private contextWindowStr: string = ''
  private tokenUsedStr: string = ''
  private contextWindow: number = 0
  private tokensUsed: number = 0

  constructor(
    tui: TUI,
    private editorTheme: EditorTheme,
    private globalTheme: Theme,
    keybindings: KeybindingsManager
  ) {
    super(tui, editorTheme, keybindings)
  }

  private formatInputWithCommandHighlight(input: string): string {
    const commandMatch = input.match(/^\s*\/([\w:-]+)(.*)$/)
    if (!commandMatch) return input

    const command = `${' '.repeat(this.getPaddingX())}/${commandMatch[1]}`
    const rest = commandMatch[2]
    const styledCommand = this.editorTheme.selectList.selectedPrefix(command) ?? command
    return `${styledCommand}${rest}`
  }

  // Override to disable padding, since we're handling it in render for better control
  setPaddingX(): void {}

  getPaddingX(): number {
    return 0
  }

  refresh() {
    this.tui.requestRender()
  }

  private padAnsi(line: string, width: number): string {
    const w = visibleWidth(line)
    return line + ' '.repeat(width - w)
  }

  private getFirstLineIndex(lines: string[]): number {
    return lines.findIndex(line => line.includes(this.borderPart))
  }

  private getLastLineIndex(lines: string[]): number {
    return lines.findLastIndex(line => line.includes(this.borderPart))
  }

  private formatTokens(count: number): string {
    if (count < 1000) return count.toString()
    if (count < 10000) return `${(count / 1000).toFixed(1)}k`
    if (count < 1000000) return `${Math.round(count / 1000)}k`
    if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`
    return `${Math.round(count / 1000000)}M`
  }

  setUsage(data: { contextWindow: number; tokensUsed: number }) {
    this.contextWindow = data.contextWindow
    this.tokensUsed = data.tokensUsed
    this.contextWindowStr = this.formatTokens(data.contextWindow)
    this.tokenUsedStr = this.formatTokens(data.tokensUsed)
  }

  getUsage(): {
    percentage: number
    contextWindow: number
    tokensUsed: number
    tokensUsedStr: string
    contextWindowStr: string
  } {
    return {
      percentage: this.contextWindow > 0 ? (this.tokensUsed / this.contextWindow) * 100 : 0,
      contextWindow: this.contextWindow,
      tokensUsed: this.tokensUsed,
      tokensUsedStr: this.tokenUsedStr,
      contextWindowStr: this.contextWindowStr,
    }
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - this.prefix.length - this.suffix.length)

    const lines = super.render(innerWidth)
    if (lines.length < 2) return lines

    // Style input line with command highlight
    const inputLineIdx = lines.findIndex(line => !line.includes(this.borderPart))
    if (inputLineIdx >= 0 && inputLineIdx < lines.length) {
      lines[inputLineIdx] = this.formatInputWithCommandHighlight(lines[inputLineIdx])
    }

    // Insert a line below the top border
    lines.splice(this.getFirstLineIndex(lines) + 1, 0, '')

    // Insert infos above the bottom border
    const model = this.model.name.toUpperCase()
    const thinking = this.borderColor(this.thinking !== 'off' ? `  ${this.thinking}` : '')
    const leftPart = `${model}${thinking}`

    const usage = this.getUsage()
    const context = `${usage.tokensUsedStr}/${usage.contextWindowStr} (${Math.floor(usage.percentage)}%)`
    let colorizedUsage: string
    const percentageValue = Math.floor(usage.percentage)
    if (percentageValue >= 90) {
      colorizedUsage = this.globalTheme.fg('error', `${context}`)
    } else if (percentageValue >= 70) {
      colorizedUsage = this.globalTheme.fg('warning', `${context}`)
    } else {
      colorizedUsage = this.globalTheme.fg('dim', `${context}`)
    }
    const rightPart = `${colorizedUsage}`

    const space = ' '.repeat(
      Math.max(0, innerWidth - visibleWidth(leftPart) - visibleWidth(rightPart))
    )
    lines.splice(this.getLastLineIndex(lines), 0, '', `${leftPart}${space}${rightPart}`, '')

    const firstLineIdx = this.getFirstLineIndex(lines)
    const lastLineIdx = this.getLastLineIndex(lines)
    for (let i = firstLineIdx + 1; i < lastLineIdx; i++) {
      lines[i] = colorBg(
        [29, 31, 35],
        this.padAnsi(this.borderColor(this.prefix) + lines[i] + this.suffix, width)
      )
    }

    const hasDropDown = this.getLastLineIndex(lines) !== lines.length - 1

    // Insert new line below the bottom border
    lines.splice(this.getLastLineIndex(lines) + 1, 0, '')

    // Remove the top and bottom borders
    lines.splice(this.getFirstLineIndex(lines), 1)
    lines.splice(this.getLastLineIndex(lines), 1)

    if (hasDropDown) {
      lines.push('')
    }

    return lines
  }
}

export default function (pi: ExtensionAPI) {
  let editor: BorderStatusEditor | undefined

  pi.on('model_select', event => {
    if (!editor) return

    editor.model.name = event.model.id
    editor.model.provider = event.model.provider
    editor.refresh()
  })

  function setContextUsage(ctx: ExtensionContext) {
    if (!editor) return

    const contextUsage = ctx.getContextUsage()
    editor.setUsage({
      contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
      tokensUsed: contextUsage?.tokens ?? 0,
    })
  }

  pi.on('thinking_level_select', event => {
    if (!editor) return

    editor.thinking = event.level
    editor.refresh()
  })

  pi.on('turn_end', (_event, ctx) => {
    if (!editor) return

    setContextUsage(ctx)
    editor?.refresh()
  })

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new BorderStatusEditor(tui, theme, ctx.ui.theme, keybindings)
      editor.model.name = ctx.model?.id ?? 'N/A'
      editor.model.provider = ctx.model?.provider ?? '-'
      editor.thinking = pi.getThinkingLevel()
      setContextUsage(ctx)
      editor.refresh()

      return editor
    })
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent(undefined)
  })
}
