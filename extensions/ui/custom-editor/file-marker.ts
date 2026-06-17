import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type FileMarkerMatch = {
  start: number
  end: number
  fileId: number
  filename: string
}

type CursorPosition = {
  line: number
  col: number
}

type QuoteReplacement = {
  startPos: number
  endPos: number
  marker: string
}

export class FileMarkerController {
  private fileMarkerRegex = /\[file #(\d+) ([^\]]+)\]/g

  private fileQuoteMode = false
  private fileQuoteStartLine = -1
  private fileQuoteStartCol = -1

  private files: Map<number, string> = new Map()
  private fileCounter = 0

  private storeFile(filePath: string): string {
    this.fileCounter++
    const fileId = this.fileCounter
    this.files.set(fileId, filePath)
    const filename = filePath.split('/').pop() ?? filePath
    return `[file #${fileId} ${filename}]`
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

  private expandUserPath(filePath: string): string {
    if (filePath === '~') return os.homedir()
    if (filePath.startsWith('~/')) return path.join(os.homedir(), filePath.slice(2))
    return filePath
  }

  private isTrackedQuoteStillValid(lines: string[]): boolean {
    if (!this.fileQuoteMode) return false
    if (this.fileQuoteStartLine < 0 || this.fileQuoteStartLine >= lines.length) return false

    const line = lines[this.fileQuoteStartLine] ?? ''
    const quoteIndex = this.fileQuoteStartCol - 1
    return quoteIndex >= 0 && line[quoteIndex] === "'"
  }

  private getTrackedQuotedPath(
    text: string,
    lines: string[],
    cursor: CursorPosition,
    getAbsoluteIndex: (line: number, col: number, allLines: string[]) => number
  ): string | null {
    if (!this.isTrackedQuoteStillValid(lines)) return null

    const startPos = getAbsoluteIndex(this.fileQuoteStartLine, this.fileQuoteStartCol - 1, lines)
    const endPos = getAbsoluteIndex(cursor.line, cursor.col, lines)
    if (endPos <= startPos + 1) return ''

    return text.slice(startPos + 1, endPos - 1)
  }

  private startFileQuoteTracking(cursor: CursorPosition): void {
    this.fileQuoteMode = true
    this.fileQuoteStartLine = cursor.line
    this.fileQuoteStartCol = cursor.col
  }

  private endFileQuoteTracking(): void {
    this.fileQuoteMode = false
    this.fileQuoteStartLine = -1
    this.fileQuoteStartCol = -1
  }

  private findContainingMarker(line: string, col: number): FileMarkerMatch | null {
    return this.getFileMarkers(line).find(marker => marker.start < col && col < marker.end) ?? null
  }

  private findMarkerEndingAt(line: string, col: number): FileMarkerMatch | null {
    return this.getFileMarkers(line).find(marker => marker.end === col) ?? null
  }

  expandText(text: string): string {
    return text.replace(this.fileMarkerRegex, (match, fileId) => {
      return this.files.get(Number.parseInt(fileId, 10)) ?? match
    })
  }

  clear(): void {
    this.files.clear()
    this.fileCounter = 0
    this.endFileQuoteTracking()
  }

  highlight(input: string, colorize: (text: string) => string): string {
    return input.replace(this.fileMarkerRegex, (_match, fileId: string, filename: string) => {
      return colorize(`[file #${fileId} ${filename}]`)
    })
  }

  getSnappedCursorCol(line: string, col: number, direction: 'left' | 'right'): number | null {
    const marker = this.findContainingMarker(line, col)
    if (!marker) return null

    return direction === 'left' ? marker.start : marker.end
  }

  deleteMarkerAtBackspace(
    line: string,
    col: number
  ): { nextLine: string; nextCursorCol: number; fileId: number } | null {
    if (col <= 0 || line[col - 1] !== ']') return null

    const marker = this.findMarkerEndingAt(line, col)
    if (!marker) return null

    this.files.delete(marker.fileId)

    return {
      nextLine: `${line.slice(0, marker.start)}${line.slice(marker.end)}`,
      nextCursorCol: marker.start,
      fileId: marker.fileId,
    }
  }

  syncQuoteTracking(lines: string[]): void {
    if (this.fileQuoteMode && !this.isTrackedQuoteStillValid(lines)) {
      this.endFileQuoteTracking()
    }
  }

  handleQuoteInput({
    text,
    lines,
    cursor,
    getAbsoluteIndex,
  }: {
    text: string
    lines: string[]
    cursor: CursorPosition
    getAbsoluteIndex: (line: number, col: number, allLines: string[]) => number
  }): QuoteReplacement | null {
    if (!this.fileQuoteMode) {
      this.startFileQuoteTracking(cursor)
      return null
    }

    const filePath = this.getTrackedQuotedPath(text, lines, cursor, getAbsoluteIndex)
    if (!filePath) {
      this.startFileQuoteTracking(cursor)
      return null
    }

    try {
      const resolvedPath = this.expandUserPath(filePath)
      if (!fs.existsSync(resolvedPath)) {
        this.startFileQuoteTracking(cursor)
        return null
      }

      const marker = this.storeFile(resolvedPath)
      const startPos = getAbsoluteIndex(this.fileQuoteStartLine, this.fileQuoteStartCol - 1, lines)
      const endPos = getAbsoluteIndex(cursor.line, cursor.col, lines)

      this.endFileQuoteTracking()

      return { startPos, endPos, marker }
    } catch {
      this.startFileQuoteTracking(cursor)
      return null
    }
  }
}
