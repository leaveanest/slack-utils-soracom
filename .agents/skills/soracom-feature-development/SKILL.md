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
   - Shared SORACOM domain logic and queue/state helpers: `lib/soracom/`
   - Shared Slack helpers such as file upload plumbing: `lib/slack/`
   - Persistent state definitions: `datastores/`
3. Prefer custom steps as the main deliverable. Workflows are recommended
   compositions, and triggers are optional examples.
4. When adding, removing, or renaming a Function, Workflow, or Datastore, update
   `manifest.ts` in the same change.
5. Keep the product direction from `README.md`: prefer Slack-side operational
   workflows for confirmation, reporting, and review over thin API wrappers.
6. Design around Slack Platform constraints from the start:
   - interactive paths must stay short
   - deployed Functions have tighter runtime limits than local `slack run`
   - long-running collection or export work should use a Datastore-backed job
     pattern instead of one large synchronous Function
7. Before finishing, run the smallest useful validation set, then expand to full
   checks if the change is broad.

## Implementation Rules

- Follow the existing `DefineFunction(...)` + `SlackFunction(...)` pattern.
- Keep `1 Function = 1 responsibility` so the result composes cleanly in
  Workflow Builder.
- Add JSDoc to exported functions and non-trivial helpers.
- Reuse `lib/soracom/` and `lib/slack/` instead of introducing duplicate client
  or upload logic.
- Use `SendDm` for DM delivery flows; keep `SendMessage` for channel posting.
- If a feature uploads files, follow the existing external upload flow instead
  of reintroducing deprecated `files.upload`.
- If a feature reads Slack history, account for required scopes, bot channel
  membership, pagination, and rate limits.
- Treat `triggers/` as optional examples, not the center of the repo. Avoid
  committing new scheduled triggers unless they are clearly reusable samples.
- Keep changes narrow; avoid unrelated refactors while touching feature code.
- If a change introduces new user-facing strings, also use
  `$soracom-quality-checks`.

## Required Checks Before Handoff

- `manifest.ts` registration is complete.
- New or changed Functions have matching `test.ts` coverage.
- New outgoing calls are reflected in `manifest.ts` `outgoingDomains` when
  needed.
- Datastore-backed jobs or pagination paths are covered when the change depends
  on them.
- Formatting, lint, type-check, and tests were run at an appropriate scope.

Read `references/repo-map.md` when you need the repository-specific layout and
validation commands.
