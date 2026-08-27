---
name: git
description: Create clear Git branch names, Conventional Commit messages, and complete pull request descriptions. Use when creating, naming, reviewing, or preparing branches, commits, or PRs.
---

# Git Writing

Use this skill for Git branches, commits, and pull requests.

## First: adopt repository conventions

Before proposing or creating Git metadata:

1. Read `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, PR templates, and GitHub configuration when present.
2. Inspect recent history with `git log --oneline -20` and existing branch names with `git branch -a`.
3. Follow an explicit repository convention over this guide.
4. Ask only when a choice materially affects the result (for example, ticket number or PR language).

Never commit, push, create a branch, or open a PR unless the user explicitly requests that action.

## Branch names

Use lowercase kebab-case and a short, action-oriented summary:

```text
<type>/<short-summary>
```

Use an issue identifier when the repository convention requires it:

```text
<type>/<ticket>-<short-summary>
```

Preferred types:

| Type | Use for |
| --- | --- |
| `feat` | New user-facing capability |
| `fix` | Bug correction |
| `docs` | Documentation only |
| `refactor` | Structural change without behavior change |
| `test` | Test-only change |
| `chore` | Tooling, dependencies, maintenance |
| `ci` | CI/CD configuration |
| `perf` | Performance improvement |

Examples:

```text
feat/add-password-reset
fix/482-handle-expired-token
docs/update-installation-guide
refactor/extract-validation-service
```

Rules:

- Start with the type, use `/` as the separator.
- Describe the intended outcome, not the implementation detail.
- Keep it short: ideally 3–6 meaningful words after the type.
- Do not use spaces, capitals, accents, underscores, vague words (`update`, `changes`, `fixes`), personal names, or dates.

## Commit messages

Follow Conventional Commits unless repository history uses another format:

```text
<type>(<optional-scope>): <imperative summary>
```

Examples:

```text
feat(auth): add password reset flow
fix(api): return 404 for missing sessions
docs: clarify local setup steps
refactor(validation): extract email validator
chore(deps): upgrade vite to 6.1.0
```

Rules:

- Use the same types as branch names; add `build` for build-system changes when useful.
- Write the summary in imperative present tense: `add`, `fix`, `remove`, `prevent`.
- Lowercase the summary; omit the final period.
- Keep the subject within 72 characters when practical.
- Make one logical change per commit; do not mix refactors with behavior changes unless inseparable.
- Use `!` and a `BREAKING CHANGE:` footer for intentional breaking changes:

```text
feat(api)!: remove legacy session endpoint

BREAKING CHANGE: clients must use /v2/sessions.
```

Add a body when the subject cannot explain **why**, scope, migration impact, or risk:

```text
fix(auth): prevent refresh-token reuse

Invalidate the token family after a refresh attempt to block replay attacks.

Refs: #482
```

Avoid generic subjects such as `fix bug`, `updates`, `wip`, `misc`, or `changes`.

## Pull request descriptions

Use the repository PR template if it exists. Otherwise, write in the repository's primary language and use this structure:

```markdown
## Summary

- <what changed and why>
- <second relevant change, if any>

## Validation

- [x] `<command run>`
- [x] <manual verification performed>

## Risks / rollout

- <risk, migration, feature flag, monitoring, or `None`>

## Related

- Closes #<issue>
```

Rules:

- Explain the outcome and reason, not a file-by-file diff.
- Lead with the user or system impact.
- Include only checks actually run; never claim unrun tests passed.
- State omitted validation and why.
- Call out breaking changes, migrations, configuration changes, security implications, and rollback steps.
- Use GitHub closing keywords (`Closes`, `Fixes`, `Resolves`) only for the issue the PR should close.
- Keep the title concise, imperative, and aligned with the commit convention. Omit the Conventional Commit prefix only if repository PRs do.

## Response format

When asked to draft Git metadata, provide only the applicable artifacts:

```markdown
Branch: `fix/482-handle-expired-token`

Commit:
```text
fix(api): return 401 for expired tokens
```

PR title: `fix(api): return 401 for expired tokens`

PR description:
<markdown description>
```

Offer 2–3 alternatives only when there is a real naming trade-off. Verify that each proposal matches the actual diff and repository conventions.
