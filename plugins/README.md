# Claude Code plugins

Future standalone Claude Code plugins belong in `plugins/<plugin-name>/`.
Each plugin needs its own `.claude-plugin/plugin.json` and must be added to the
root `.claude-plugin/marketplace.json` with `source: "./plugins/<plugin-name>"`.

`system-prompts` intentionally remains the root plugin because it reads the
shared root `system-prompts/` directory.
