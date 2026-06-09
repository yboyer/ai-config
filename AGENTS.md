# Project Guidelines

## Pi Documentation

Only apply this section when the user asks about pi itself, its SDK, extensions, themes, skills, prompt templates, TUI, keybindings, custom providers, models, or pi packages.

- Main documentation: `./node_modules/@earendil-works/pi-coding-agent/README.md`
- Additional docs root: `./node_modules/@earendil-works/pi-coding-agent/docs`
- Examples root: `./node_modules/@earendil-works/pi-coding-agent/examples`
- When resolving `docs/...`, read from the Additional docs root, not from the workspace root.
- When resolving `examples/...`, read from the Examples root, not from the workspace root.
- Read pi markdown files completely before answering or implementing changes.
- Follow markdown cross-references mentioned by the pi docs before implementing changes.
- If a pi topic points to a related doc, read that related doc too.

## Pi Topic Map

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

## Working Rule

When working on pi-specific topics, consult the relevant docs and examples first, then implement.
