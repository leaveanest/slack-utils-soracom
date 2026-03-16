# Repo Map

## Main paths

- `functions/`: reusable Slack custom steps. Existing pattern is `mod.ts` plus
  `test.ts`.
- `workflows/`: recommended flows composed from Functions.
- `triggers/`: optional examples for shortcuts or schedules.
- `lib/soracom/`: API client, datastore helpers, shared types, formatting
  helpers.
- `lib/i18n/`: translation loading and helpers.
- `lib/validation/`: validation helpers.
- `datastores/`: Slack datastore definitions.
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
- For new outgoing calls, confirm `manifest.ts` `outgoingDomains`.
- Prefer existing sibling implementations over introducing a new pattern.
