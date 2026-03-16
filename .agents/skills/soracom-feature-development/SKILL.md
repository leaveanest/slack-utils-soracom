---
name: soracom-feature-development
description: Use when implementing or updating Slack Functions, Workflows, Triggers, Datastore definitions, or shared SORACOM logic in this repository. Trigger for changes under functions/, workflows/, triggers/, datastores/, lib/soracom/, manifest.ts, or related feature work.
---

# Slack SORACOM Development

Use this skill for feature work in this repository.

## Workflow

1. Start from the nearest existing feature and copy its shape before writing
   code.
2. Put changes in the expected layer:
   - Slack custom step: `functions/<name>/mod.ts`
   - Tests for that step: `functions/<name>/test.ts`
   - Workflow composition: `workflows/`
   - Optional example trigger: `triggers/`
   - Shared SORACOM logic: `lib/soracom/`
   - Persistent Slack app settings: `datastores/` and `lib/soracom/datastore.ts`
3. When adding a Function or Workflow, update `manifest.ts` in the same change.
4. Keep the product direction from `README.md`: prefer Slack-side operational
   workflows over thin API wrappers.
5. Before finishing, run the smallest useful validation set, then expand to full
   checks if the change is broad.

## Implementation Rules

- Follow the existing `DefineFunction(...)` + `SlackFunction(...)` pattern.
- Add JSDoc to exported functions and non-trivial helpers.
- Reuse `lib/soracom/` instead of introducing duplicate client logic.
- Treat `triggers/` as optional examples, not the center of the repo.
- Keep changes narrow; avoid unrelated refactors while touching feature code.
- If a change introduces new user-facing strings, also use
  `$soracom-quality-checks`.

## Required Checks Before Handoff

- `manifest.ts` registration is complete.
- New or changed Functions have matching `test.ts` coverage.
- Formatting, lint, type-check, and tests were run at an appropriate scope.

Read `references/repo-map.md` when you need the repository-specific layout and
validation commands.
