# Project Guidelines

`@yboyer/ai-config` is an npm package that provides custom Pi agents, extensions, and themes.

## Repository

- Use npm. The supported Node.js version is defined in `.node-version`; install dependencies with `npm ci`.
- Run `npm run lint` after TypeScript, JSON, or configuration changes.
- Read `README.md` before changing package installation or user-facing setup.
- Keep package exports in sync with `package.json` when adding or moving extensions, agents, or themes.

### Directory map

- `extensions/`: Pi extensions, grouped by command, system prompt, tool, and UI concerns.
- `agents/`: Pi agent definitions.
- `themes/`: Pi themes.
- `.plugin/plugin.json`: plugin metadata.
- `.pi/`: local Pi settings; do not treat it as package content.

## Pi Documentation

Apply this section only for Pi, its SDK, extensions, themes, skills, prompt templates, TUI, keybindings, custom providers, models, or packages.

- Main documentation: `./node_modules/@earendil-works/pi-coding-agent/README.md`
- Additional docs root: `./node_modules/@earendil-works/pi-coding-agent/docs`
- Examples root: `./node_modules/@earendil-works/pi-coding-agent/examples`
- Resolve `docs/...` from the additional docs root and `examples/...` from the examples root.
- Read relevant Pi Markdown documentation completely before implementing changes. Follow its Markdown cross-references and inspect relevant examples.

### Pi topic map

- Extensions: `docs/extensions.md`, `examples/extensions/`
- Themes: `docs/themes.md`
- Skills: `docs/skills.md`
- Prompt templates: `docs/prompt-templates.md`
- TUI components: `docs/tui.md`
- Keybindings: `docs/keybindings.md`
- SDK integrations: `docs/sdk.md`
- Custom providers: `docs/custom-provider.md`
- Adding models: `docs/models.md`
- Pi packages: `docs/packages.md`
