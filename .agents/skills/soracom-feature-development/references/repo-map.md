# Repo Map

## Main paths

- `functions/`: reusable Slack custom steps. Existing pattern is `mod.ts` plus
  `test.ts`.
- `workflows/`: recommended flows composed from Functions.
- `triggers/`: optional examples only. This repo usually ships at most a small
  number of reusable link-trigger samples.
- `lib/soracom/`: API client, config access, queue/state modules, shared types,
  formatting helpers, and SORACOM domain logic.
- `lib/slack/`: Slack-specific helpers such as file upload support.
- `lib/i18n/`: translation loading and helpers.
- `lib/validation/`: validation helpers.
- `datastores/`: Slack datastore definitions for config, jobs, and task state.
- `manifest.ts`: central registration point for functions, workflows,
  datastores, scopes, and outgoing domains.

## Common commands

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task i18n:check
deno task i18n:test
slack run workflows/soracom_list_sims_workflow
```

## Project-specific expectations

- User-visible text should go through `t()` and locale files.
- Error handling should normalize to `Error` objects and check API success
  explicitly.
- Prefer narrow, composable Custom Functions that fit Workflow Builder.
- For long-running or rate-limited work, prefer a Datastore-backed job pattern
  over a single synchronous Function.
- DM delivery should use the Slack built-in DM path (`SendDm`) rather than a
  channel post helper.
- File uploads should reuse the existing external upload helper flow.
- `conversations.history` usage must account for bot membership, pagination, and
  rate limits.
- Datastore `limit` semantics follow DynamoDB scan behavior, so do not assume it
  applies after filters.
- For new outgoing calls, confirm `manifest.ts` `outgoingDomains`.
- Prefer existing sibling implementations over introducing a new pattern.
- Treat committed triggers as examples, not as the primary product surface.
