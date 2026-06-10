import type { Model } from '@earendil-works/pi-ai'
import type { ExtensionAPI, KeybindingsManager } from '@earendil-works/pi-coding-agent'
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

  constructor(
    tui: TUI,
    private editorTheme: EditorTheme,
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
    lines.splice(
      this.getLastLineIndex(lines),
      0,
      '',
      `${this.model.name.toUpperCase()}${this.borderColor(this.thinking !== 'off' ? `  ${this.thinking}` : '')} `,
      ''
    )

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

  pi.on('thinking_level_select', event => {
    if (!editor) return

    editor.thinking = event.level
    editor.refresh()
  })

  pi.on('session_start', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      editor = new BorderStatusEditor(tui, theme, keybindings)
      editor.model.name = ctx.model?.id ?? 'N/A'
      editor.model.provider = ctx.model?.provider ?? '-'
      editor.thinking = pi.getThinkingLevel()
      editor.refresh()

      return editor
    })
  })

  pi.on('session_shutdown', (_event, ctx) => {
    if (!ctx.hasUI) return

    ctx.ui.setEditorComponent(undefined)
  })
}
