# @yboyer/ai-config

<p align="center">
  <img src="https://raw.githubusercontent.com/yboyer/pi/master/.assets/pi.png" width="768">
</p>

Pi package with custom setup:

- custom extensions
- custom skills
- custom prompt templates
- custom theme

## Harness install

Package not published on npm. Install from git only.

### Pi

```bash
pi install git:github.com/yboyer/ai-config
```

### VSCode

Use the git URL to install the extension directly from GitHub: <https://github.com/yboyer/ai-config.git>

## Skills via `npx skills`

This repo is compatible with [`npx skills`](https://github.com/vercel-labs/skills) because skills live in `skills/`.

Example:

```bash
npx skills add github.com/yboyer/ai-config
```

## Pi personal setup

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
    "git:github.com/yboyer/ai-config",
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
    "read": false,
    "grep": false,
    "find": false,
    "ls": false,
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
  "bashCollapsedLines": 5,
  "diffViewMode": "auto",
  "diffIndicatorMode": "bars",
  "diffSplitMinWidth": 120,
  "diffCollapsedLines": 24,
  "diffWordWrap": true,
  "showTruncationHints": false,
  "showRtkCompactionHints": false
}
```
