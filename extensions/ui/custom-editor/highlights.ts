const atFileRegex = /(^|[ \t])(@"[^"]*"|@[^\s"]+)/g
export function highlightAtFiles(input: string, colorize: (text: string) => string): string {
  return input.replace(atFileRegex, (_match, prefix: string, taggedPath: string) => {
    return prefix + colorize(taggedPath)
  })
}

const inlineCodeRegex = /`[^`\n]*`/g
export function highlightInlineCode(input: string, colorize: (text: string) => string): string {
  return input.replace(inlineCodeRegex, match => colorize(match))
}
