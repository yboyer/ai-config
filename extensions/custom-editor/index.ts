import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

type FileMarkerMatch = {
  start: number
  end: number
  fileId: number
  filename: string
}

class BorderStatusEditor extends CustomEditor {
  private prefix = '▎ '
  private suffix = ' '
  private atFileRegex = /(^|[ \t])(@"[^"]*"|@[^\s"]+)/g
  private fileMarkerRegex = /\[file #(\d+) ([^\]]+)\]/g

  // File path quote tracking
  private fileQuoteMode = false
  private fileQuoteStartLine = -1
  private fileQuoteStartCol = -1
  private model: Pick<Model<'any'>, 'name' | 'provider'> = {
    name: '',
    provider: '',
  }
  thinking: ThinkingLevel = 'off'
  private contextWindowStr = ''
  private tokenUsedStr = ''
  private contextWindow = 0
  private tokensUsed = 0

  // File tracking for collapsed file markers
  private files: Map<number, string> = new Map()
  private fileCounter = 0

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

  /** Store a file path and return its marker */
  private storeFile(filePath: string): string {
    this.fileCounter++
    const fileId = this.fileCounter
    this.files.set(fileId, filePath)
    const filename = filePath.split('/').pop() ?? filePath
    return `[file #${fileId} ${filename}]`
  }

  override getExpandedText(): string {
    const text = super.getExpandedText()

    return text.replace(this.fileMarkerRegex, (match, fileId) => {
      return this.files.get(Number.parseInt(fileId, 10)) ?? match
    })
  }

  /** Clear file tracking (called on submit) */
  private clearFiles(): void {
    this.files.clear()
    this.fileCounter = 0
  }

  private highlightAtFiles(input: string): string {
    return input.replace(this.atFileRegex, (_match, prefix: string, taggedPath: string) => {
      return colorFg([249, 157, 29], prefix + taggedPath)
    })
  }

  private highlightFileMarkers(input: string): string {
    return input.replace(this.fileMarkerRegex, (_match, fileId: string, filename: string) => {
      return colorFg([249, 157, 29], `[file #${fileId} ${filename}]`)
    })
  }

  private getEditorState(): EditorOverride['state'] {
    const editor = this as unknown as EditorOverride
    return editor.state
  }

  private setCursor(col: number): void {
    const editor = this as unknown as EditorOverride
    editor.setCursorCol(col)
  }

  private getFileMarkers(line: string): FileMarkerMatch[] {
    const markers: FileMarkerMatch[] = []
    const fileMarkerRegex = new RegExp(this.fileMarkerRegex.source, this.fileMarkerRegex.flags)

    for (const match of line.matchAll(fileMarkerRegex)) {
      const start = match.index ?? -1
      const fileId = Number.parseInt(match[1] ?? '', 10)
      if (start < 0 || !Number.isFinite(fileId) || !this.files.has(fileId)) continue

      markers.push({
        start,
        end: start + match[0].length,
        fileId,
        filename: match[2] ?? '',
      })
    }

    return markers
  }

  private findContainingFileMarker(line: string, col: number): FileMarkerMatch | null {
    return this.getFileMarkers(line).find(marker => marker.start < col && col < marker.end) ?? null
  }

  private findFileMarkerEndingAt(line: string, col: number): FileMarkerMatch | null {
    return this.getFileMarkers(line).find(marker => marker.end === col) ?? null
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
    const marker = this.findContainingFileMarker(line, state.cursorCol)
    if (!marker) return

    this.setCursor(direction === 'left' ? marker.start : marker.end)
  }

  private handleFileMarkerBackspace(): boolean {
    const state = this.getEditorState()
    if (state.cursorCol <= 0) return false

    const line = state.lines[state.cursorLine] ?? ''
    if (line[state.cursorCol - 1] !== ']') return false

    const marker = this.findFileMarkerEndingAt(line, state.cursorCol)
    if (!marker) return false

    const editor = this as unknown as EditorOverride

    editor.historyIndex = -1
    editor.lastAction = null
    editor.pushUndoSnapshot()

    state.lines[state.cursorLine] = `${line.slice(0, marker.start)}${line.slice(marker.end)}`
    this.setCursor(marker.start)

    this.files.delete(marker.fileId)

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

  private expandUserPath(filePath: string): string {
    if (filePath === '~') return os.homedir()
    if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
    return filePath
  }

  private getAbsoluteIndex(line: number, col: number, lines: string[]): number {
    let index = 0
    for (let i = 0; i < line; i++) {
      index += lines[i].length + 1
    }
    return index + col
  }

  private isTrackedQuoteStillValid(lines: string[]): boolean {
    if (!this.fileQuoteMode) return false
    if (this.fileQuoteStartLine < 0 || this.fileQuoteStartLine >= lines.length) return false

    const line = lines[this.fileQuoteStartLine] ?? ''
    const quoteIndex = this.fileQuoteStartCol - 1
    return quoteIndex >= 0 && line[quoteIndex] === "'"
  }

  private getTrackedQuotedPath(text: string, lines: string[]): string | null {
    if (!this.isTrackedQuoteStillValid(lines)) return null

    const cursor = this.getCursor()
    const startPos = this.getAbsoluteIndex(
      this.fileQuoteStartLine,
      this.fileQuoteStartCol - 1,
      lines
    )
    const endPos = this.getAbsoluteIndex(cursor.line, cursor.col, lines)
    if (endPos <= startPos + 1) return ''

    return text.slice(startPos + 1, endPos - 1)
  }

  private replaceRange(startPos: number, endPos: number, replacement: string): void {
    const text = this.getText()
    const nextText = `${text.slice(0, startPos)}${replacement}${text.slice(endPos)}`
    const nextLines = nextText.split('\n')
    const nextCursor = this.calculatePos(startPos + replacement.length, nextLines)

    this.setText(nextText)
    this.setCursor(nextCursor.col)
  }

  private startFileQuoteTracking(): void {
    const cursor = this.getCursor()

    this.fileQuoteMode = true
    this.fileQuoteStartLine = cursor.line
    this.fileQuoteStartCol = cursor.col
  }

  private endFileQuoteTracking(): void {
    this.fileQuoteMode = false
  }

  override handleInput(data: string): void {
    if (
      this.keybindingsManager.matches(data, 'tui.editor.deleteCharBackward') &&
      this.handleFileMarkerBackspace()
    ) {
      return
    }

    super.handleInput(data)

    const navigationDirection = this.getNavigationDirection(data)
    if (navigationDirection) {
      this.snapCursorOutOfFileMarker(navigationDirection)
    }

    if (!this.fileQuoteMode && data !== "'") return

    const text = this.getText()
    const lines = text.split('\n')

    if (this.fileQuoteMode && !this.isTrackedQuoteStillValid(lines)) {
      this.endFileQuoteTracking()
    }

    // Handle file path quotes: detect opening/closing '
    if (data !== "'") return

    if (!this.fileQuoteMode) {
      this.startFileQuoteTracking()
      return
    }

    const filePath = this.getTrackedQuotedPath(text, lines)
    if (!filePath) {
      this.startFileQuoteTracking() // Restart tracking
      return
    }

    try {
      const resolvedPath = this.expandUserPath(filePath)
      if (!fs.existsSync(resolvedPath)) {
        this.startFileQuoteTracking() // Restart tracking
        return
      }

      const marker = this.storeFile(resolvedPath)
      const cursor = this.getCursor()
      const startPos = this.getAbsoluteIndex(
        this.fileQuoteStartLine,
        this.fileQuoteStartCol - 1,
        lines
      )
      const endPos = this.getAbsoluteIndex(cursor.line, cursor.col, lines)

      this.replaceRange(startPos, endPos, marker)
      this.endFileQuoteTracking()
    } catch {
      this.startFileQuoteTracking() // Restart tracking
    }
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

  private applyInlineHighlighting(input: string): string {
    return input
      .split(/(`[^`\n]*`)/g)
      .map(part =>
        part.startsWith('`') && part.endsWith('`')
          ? this.globalTheme.fg('syntaxString', part)
          : this.highlightFileMarkers(this.highlightAtFiles(part))
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

    return [this.formatInputWithCommandHighlight(firstLine), ...others].map(line =>
      this.applyInlineHighlighting(line)
    )
  }

  private renderContentRow(line: string, width: number): string {
    const row = this.borderColor(this.prefix) + line + this.suffix
    const rowWidth = visibleWidth(row)

    return colorBg([29, 31, 35], row + ' '.repeat(width - rowWidth))
  }

  override onSubmit = () => {
    this.clearFiles()
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

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent(undefined)
  })
}
