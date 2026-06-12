# @yboyer/pi-config

<p align="center">
  <img src="https://raw.githubusercontent.com/yboyer/pi/master/.assets/pi.png" width="768">
</p>

Pi package with custom setup:

- custom extensions
- custom skills
- custom prompt templates
- custom theme

## Install

```bash
pi install git:github.com/yboyer/pi-config
```

## Skills via `npx skills`

This repo is compatible with [`npx skills`](https://github.com/vercel-labs/skills) because skills live in `skills/`.

Example:

```bash
npx skills add github.com/yboyer/pi-config
```

## Personal setup

### `settings.json`

```json
{
  "theme": "one-dark-pro",
  "hideThinkingBlock": false,
  "showHardwareCursor": false,
  "quietStartup": true,
  "compaction": {
    "enabled": false
  },
  "autocompleteMaxVisible": 7,
  "treeFilterMode": "default"
  "packages": [
    "npm:pi-tool-display",
    "npm:@juicesharp/rpiv-ask-user-question",
    "npm:pi-mcp-adapter",
    "git:github.com/yboyer/pi-config",
    {
      "source": "npm:context-mode",
      "skills": [
        "-skills/ctx-doctor/SKILL.md",
        "-skills/ctx-index/SKILL.md",
        "-skills/ctx-insight/SKILL.md",
        "-skills/ctx-purge/SKILL.md",
        "-skills/ctx-search/SKILL.md",
        "-skills/ctx-stats/SKILL.md",
        "-skills/ctx-upgrade/SKILL.md",
        "-skills/context-mode/SKILL.md"
      ]
    }
  ]
}
```

### `npm:pi-tool-display`

```json
{
  "registerToolOverrides": {
    "read": true,
    "grep": true,
    "find": true,
    "ls": true,
    "bash": true,
    "edit": true,
    "write": true
  },
  "enableNativeUserMessageBox": false,
  "readOutputMode": "hidden",
  "searchOutputMode": "hidden",
  "mcpOutputMode": "hidden",
  "previewLines": 8,
  "expandedPreviewMaxLines": 4000,
  "bashOutputMode": "opencode",
  "bashCollapsedLines": 0,
  "diffViewMode": "auto",
  "diffIndicatorMode": "bars",
  "diffSplitMinWidth": 120,
  "diffCollapsedLines": 24,
  "diffWordWrap": true,
  "showTruncationHints": false,
  "showRtkCompactionHints": false
}
```
