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

import { splitRenderedEditor } from './editor-autocomplete'

function colorBg(rgb: [number, number, number], text: string): string {
  const bg = `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
  const reset = '\x1b[0m'
  const keepBgAcrossResets = text.split(reset).join(`${reset}${bg}`)
  return `${bg}${keepBgAcrossResets}${reset}`
}

function colorFg(rgb: [number, number, number], text: string): string {
  const fg = `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`
  const reset = '\x1b[0m'
  const keepFgAcrossResets = text.split(reset).join(`${reset}${fg}`)
  return `${fg}${keepFgAcrossResets}${reset}`
}

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

class BorderStatusEditor extends CustomEditor {
  private prefix = '▎ '
  private suffix = ' '
  private atFileRegex = /(^|[ \t])(@[^\s]*)/g
  model: Pick<Model<'any'>, 'name' | 'provider'> = {
    name: '',
    provider: '',
  }
  thinking: ThinkingLevel = 'off'
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

  private highlightAtFiles(input: string): string {
    return input.replace(this.atFileRegex, (_match, prefix: string, taggedPath: string) => {
      return `${prefix}${colorFg([249, 157, 29], taggedPath)}`
    })
  }

  private applyInlineHighlighting(input: string): string {
    return input
      .split(/(`[^`\n]*`)/g)
      .map(part =>
        part.startsWith('`') && part.endsWith('`')
          ? this.globalTheme.fg('syntaxString', part)
          : this.highlightAtFiles(part)
      )
      .join('')
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

  private thinkingColor(text: string): string {
    return this.globalTheme.getThinkingBorderColor(this.thinking)(text)
  }

  private renderMetadata(width: number): string {
    const model = this.model.name.toUpperCase()
    const thinking = this.thinkingColor(this.thinking !== 'off' ? `  ${this.thinking}` : '')
    const leftPart = `${model}${thinking}`

    const percentage = this.contextWindow > 0 ? (this.tokensUsed / this.contextWindow) * 100 : 0

    const context = `${this.tokenUsedStr}/${this.contextWindowStr} (${Math.floor(percentage)}%)`
    let colorizedUsage: string
    const percentageValue = Math.floor(percentage)
    if (percentageValue >= 90) {
      colorizedUsage = this.globalTheme.fg('error', `${context}`)
    } else if (percentageValue >= 70) {
      colorizedUsage = this.globalTheme.fg('warning', `${context}`)
    } else {
      colorizedUsage = this.globalTheme.fg('dim', `${context}`)
    }
    const rightPart = `${colorizedUsage}`

    const space = ' '.repeat(Math.max(0, width - visibleWidth(leftPart) - visibleWidth(rightPart)))

    return `${leftPart}${space}${rightPart}`
  }

  private renderInput(lines: string[]): string[] {
    const [firstLine = '', ...others] = lines

    return [this.formatInputWithCommandHighlight(firstLine), ...others].map(line =>
      this.applyInlineHighlighting(line)
    )
  }

  private renderContentRow(line: string, width: number): string {
    const row = this.borderColor(this.prefix) + line + this.suffix
    const w = visibleWidth(row)

    return colorBg([29, 31, 35], row + ' '.repeat(width - w))
  }

  render(width: number): string[] {
    const innerWidth = Math.max(1, width - this.prefix.length - this.suffix.length)

    const rendered = super.render(innerWidth)
    if (rendered.length < 2) return rendered

    const { editorFrame, autocompleteLines } = splitRenderedEditor(this, rendered, innerWidth)

    const editorLines = editorFrame.slice(1, -1)
    const inputLines = this.renderInput(editorLines)
    const metadata = this.renderMetadata(innerWidth)
    const lines = ['', ...inputLines, '', metadata, '']
    const hasSuggestions = autocompleteLines.length > 0
    const rows = lines.map(line => this.renderContentRow(line, width))

    rows.push('')

    if (hasSuggestions) {
      rows.push(...autocompleteLines)
      rows.push('')
    }

    return rows
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
