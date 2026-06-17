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
import { FileMarkerController } from './file-marker'
import { highlightAtFiles, highlightInlineCode } from './highlights'

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

type EditorOverride = {
  state: {
    lines: string[]
    cursorLine: number
    cursorCol: number
  }
  setCursorCol: (col: number) => void
  historyIndex: number
  lastAction: string | null
  pushUndoSnapshot: () => void
  autocompleteState?: unknown
  updateAutocomplete: () => void
  isInSlashCommandContext: (textBeforeCursor: string) => boolean
  tryTriggerAutocomplete: () => void
}

class BorderStatusEditor extends CustomEditor {
  private prefix = '▎ '
  private suffix = ' '
  private fileMarkers = new FileMarkerController()

  private model: Pick<Model<'any'>, 'name' | 'provider'> = {
    name: '',
    provider: '',
  }
  thinking: ThinkingLevel = 'off'
  private contextWindowStr = ''
  private tokenUsedStr = ''
  private contextWindow = 0
  private tokensUsed = 0

  constructor(
    tui: TUI,
    private editorTheme: EditorTheme,
    private globalTheme: Theme,
    private keybindingsManager: KeybindingsManager
  ) {
    super(tui, editorTheme, keybindingsManager)
  }

  setModel(model: Pick<Model<'any'>, 'name' | 'provider'>) {
    this.model = model
  }

  getTextExpanded(text: string): string {
    return this.fileMarkers.expandText(text)
  }

  private getEditorState(): EditorOverride['state'] {
    const editor = this as unknown as EditorOverride
    return editor.state
  }

  private setCursor(col: number): void {
    const editor = this as unknown as EditorOverride
    editor.setCursorCol(col)
  }

  private getNavigationDirection(data: string): 'left' | 'right' | null {
    if (
      this.keybindingsManager.matches(data, 'tui.editor.cursorLeft') ||
      this.keybindingsManager.matches(data, 'tui.editor.cursorUp') ||
      this.keybindingsManager.matches(data, 'tui.editor.cursorWordLeft') ||
      this.keybindingsManager.matches(data, 'tui.editor.pageUp')
    ) {
      return 'left'
    }

    if (
      this.keybindingsManager.matches(data, 'tui.editor.cursorRight') ||
      this.keybindingsManager.matches(data, 'tui.editor.cursorDown') ||
      this.keybindingsManager.matches(data, 'tui.editor.cursorWordRight') ||
      this.keybindingsManager.matches(data, 'tui.editor.pageDown')
    ) {
      return 'right'
    }

    return null
  }

  private snapCursorOutOfFileMarker(direction: 'left' | 'right'): void {
    const state = this.getEditorState()
    const line = state.lines[state.cursorLine] ?? ''
    const nextCursorCol = this.fileMarkers.getSnappedCursorCol(line, state.cursorCol, direction)
    if (nextCursorCol === null) return

    this.setCursor(nextCursorCol)
  }

  private handleFileMarkerBackspace(): boolean {
    const state = this.getEditorState()
    const line = state.lines[state.cursorLine] ?? ''
    const deletion = this.fileMarkers.deleteMarkerAtBackspace(line, state.cursorCol)
    if (!deletion) return false

    const editor = this as unknown as EditorOverride

    editor.historyIndex = -1
    editor.lastAction = null
    editor.pushUndoSnapshot()

    state.lines[state.cursorLine] = deletion.nextLine
    this.setCursor(deletion.nextCursorCol)

    if (this.onChange) {
      this.onChange(this.getText())
    }

    const textBeforeCursor = state.lines[state.cursorLine]?.slice(0, state.cursorCol) ?? ''
    if (editor.autocompleteState) {
      editor.updateAutocomplete()
    } else if (editor.isInSlashCommandContext(textBeforeCursor)) {
      editor.tryTriggerAutocomplete()
    } else if (textBeforeCursor.match(/(?:^|[\s])[@#][^\s]*$/)) {
      editor.tryTriggerAutocomplete()
    }

    return true
  }

  private getAbsoluteIndex(line: number, col: number, lines: string[]): number {
    let index = 0
    for (let i = 0; i < line; i++) {
      index += lines[i].length + 1
    }
    return index + col
  }

  private replaceRange(startPos: number, endPos: number, replacement: string): void {
    const text = this.getText()
    const nextText = `${text.slice(0, startPos)}${replacement}${text.slice(endPos)}`
    const nextLines = nextText.split('\n')
    const nextCursor = this.calculatePos(startPos + replacement.length, nextLines)

    this.setText(nextText)
    this.setCursor(nextCursor.col)
  }

  override handleInput(data: string): void {
    if (
      (this.keybindingsManager.matches(data, 'tui.editor.deleteCharBackward') ||
        this.keybindingsManager.matches(data, 'tui.editor.deleteWordBackward')) &&
      this.handleFileMarkerBackspace()
    ) {
      return
    }

    super.handleInput(data)

    const navigationDirection = this.getNavigationDirection(data)
    if (navigationDirection) {
      this.snapCursorOutOfFileMarker(navigationDirection)
    }

    const text = this.getText()
    const lines = text.split('\n')
    this.fileMarkers.syncQuoteTracking(lines)

    if (data !== "'") return

    const replacement = this.fileMarkers.handleQuoteInput({
      text,
      lines,
      cursor: this.getCursor(),
      getAbsoluteIndex: this.getAbsoluteIndex.bind(this),
    })
    if (!replacement) return

    this.replaceRange(replacement.startPos, replacement.endPos, replacement.marker)
  }

  /** Calculate line/col from a position index */
  private calculatePos(index: number, lines: string[]): { line: number; col: number } {
    let remaining = index
    for (let i = 0; i < lines.length; i++) {
      if (remaining <= lines[i].length) {
        return { line: i, col: remaining }
      }
      remaining -= lines[i].length + 1
    }
    return { line: lines.length - 1, col: lines[lines.length - 1]?.length ?? 0 }
  }

  private formatInputWithCommandHighlight(input: string): string {
    const commandMatch = input.match(/^\s*\/([\w:-]+)(.*)$/)
    if (!commandMatch) return input

    const command = `${' '.repeat(this.getPaddingX())}/${commandMatch[1]}`
    const rest = commandMatch[2]
    const styledCommand = this.editorTheme.selectList.selectedPrefix(command) ?? command
    return `${styledCommand}${rest}`
  }

  // Disable custom padding
  override setPaddingX(): void {}
  override getPaddingX(): number {
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
      colorizedUsage = this.globalTheme.fg('error', context)
    } else if (percentageValue >= 70) {
      colorizedUsage = this.globalTheme.fg('warning', context)
    } else {
      colorizedUsage = this.globalTheme.fg('dim', context)
    }
    const rightPart = `${colorizedUsage}`

    const space = ' '.repeat(Math.max(0, width - visibleWidth(leftPart) - visibleWidth(rightPart)))

    return `${leftPart}${space}${rightPart}`
  }

  private renderInput(lines: string[]): string[] {
    const [firstLine = '', ...others] = lines

    const modifiers: ((input: string) => string)[] = [
      input => highlightInlineCode(input, part => this.globalTheme.fg('syntaxString', part)),
      input => highlightAtFiles(input, part => colorFg([249, 157, 29], part)),
      input => this.fileMarkers.highlight(input, part => colorFg([249, 157, 29], part)),
    ]

    return [this.formatInputWithCommandHighlight(firstLine), ...others].map(line =>
      modifiers.reduce((text, modifier) => modifier(text), line)
    )
  }

  private renderContentRow(line: string, width: number): string {
    const row = this.borderColor(this.prefix) + line + this.suffix
    const rowWidth = visibleWidth(row)

    return colorBg([29, 31, 35], row + ' '.repeat(width - rowWidth))
  }

  reset(): void {
    this.fileMarkers.clear()
  }

  override render(width: number): string[] {
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

  function setContextUsage(ctx: ExtensionContext) {
    if (!editor) return

    const contextUsage = ctx.getContextUsage()
    editor.setUsage({
      contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
      tokensUsed: contextUsage?.tokens ?? 0,
    })
  }

  pi.on('model_select', event => {
    if (!editor) return

    editor.setModel({
      name: event.model?.id ?? 'N/A',
      provider: event.model?.provider ?? '-',
    })

    editor.refresh()
  })

  pi.on('thinking_level_select', event => {
    if (!editor) return

    editor.thinking = event.level
    editor.refresh()
  })

  pi.on('turn_end', (_event, ctx) => {
    if (!editor) return

    setContextUsage(ctx)
    editor.refresh()
  })

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new BorderStatusEditor(tui, theme, ctx.ui.theme, keybindings)
      editor.setModel({
        name: ctx.model?.id ?? 'N/A',
        provider: ctx.model?.provider ?? '-',
      })
      editor.thinking = pi.getThinkingLevel()
      setContextUsage(ctx)
      editor.refresh()

      return editor
    })
  })

  pi.on('input', event => {
    if (!editor) return { action: 'continue' }

    const transformedText = editor.getTextExpanded(event.text)
    editor.reset()

    return {
      action: 'transform',
      text: transformedText,
    }
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent(undefined)
  })
}
