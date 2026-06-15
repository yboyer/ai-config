---
description: Run code review sub-agent in separate `pi --print` subprocess
---

Spawn yourself as a sub-agent via bash to do a code review: $@

Use `pi --print --no-skills --tools read,grep,find,ls,bash,git` with appropriate arguments. If the user specifies a model,
use `--provider` and `--model` accordingly and do not invent provider/model values: if unclear, omit them.

Review the staged changes (`git diff --cached`)

Review for:

- Bugs and logic errors
- Security issues
- Error handling gaps
- Missing tests for risky changes
- Regression risk in touched code paths

Constraints:

- Do not modify files
- Do not fix issues
- Do not read code in parent agent; let sub-agent inspect code
- If I specify provider/model elsewhere in message, pass them through exactly; otherwise omit

Report back with:

- Severity: high | medium | low
- File/path and line when possible
- Brief explanation
- Concrete fix suggestion
- If no issues found, output exactly: `No issues found`
