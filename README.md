# @yboyer/pi

Pi package with current custom setup:

- custom extensions
- custom skills
- custom prompt templates

## Install

```bash
pi install git:github.com/yboyer/pi
```

Or from local clone:

```bash
pi install /absolute/path/to/pi
```

## What package includes

### Extensions

- `copilot-usage`: refresh current GitHub Copilot premium usage quota and show it in status bar.
- `diff`: track changed files from last agent run and open them in VS Code.
- `flow-title`: replace header with blue flowing gradient banner.
- `git-status-widget`: show current Git branch and unstaged file count.
- `tps-tracker`: show streaming tokens-per-second during generation.
- `usage`: generate Pi usage and cost report prompt for last 1/7/30/90 days.

### Skills

- `recipe`: stress-test plan against domain language and docs, one question at a time.
- `to-prd`: turn current context into a PRD file.
- `to-issues`: turn plan or spec into tracer-bullet issues.
- `to-plan`: turn plan or spec into `PLAN.md` tracer-bullet sections.

### Prompts

- `review-subagent`: spawn `pi` sub-agent for code review.

## settings.json

For full personal setup, use this `settings.json`:

```json
{
  "theme": "one-dark-pro",
  "quietStartup": true,
  "packages": [
    "npm:pi-mcp-adapter"
    "git:github.com/yboyer/pi",
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

## Skills via `npx skills`

This repo is compatible with [`npx skills`](https://github.com/vercel-labs/skills) because skills live in `skills/`.

Example:

```bash
npx skills add github.com/yboyer/pi
```
