# Quality Gates

## Code review priorities

- Missing test coverage for changed behavior
- Missing i18n updates for new strings
- Missing `manifest.ts` registration for new Functions or Workflows
- Unsafe API response access without success checks
- Silent error swallowing or string throws
- Slack Platform timeout or rate-limit assumptions that do not hold in
  production
- Trigger changes that violate the repo policy of keeping committed triggers as
  optional examples
- Misuse of DM posting, file upload, or Datastore `limit` behavior

## Commands

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task i18n:check
deno task i18n:test
deno test --allow-env --allow-read --allow-net functions/<name>/test.ts
```

## When to run what

- `deno task test`: any behavior change
- `deno test --allow-env --allow-read --allow-net functions/<name>/test.ts`:
  narrow verification for one Function
- `deno task check`: type-level or manifest-affecting change
- `deno task i18n:check`: added or changed locale keys
- `deno task i18n:test`: touched `lib/i18n/` or locale loading behavior
- Docs-only skill changes: runtime checks are optional; call that out explicitly

## Reporting expectations

- If validation was not run, say so explicitly.
- If only docs changed, note that runtime checks were not needed.
- In review mode, list findings first with file references and concrete impact.

## Platform-specific gotchas to verify

- Local `slack run` behavior is not the same as deployed runtime limits; do not
  sign off on borderline timing only because local execution passed.
- Deployed interactive paths need extra caution because the allowed response
  window is shorter than standard deployed Function runs.
- `conversations.history` requires the bot to be in the channel.
- Datastore `limit` follows DynamoDB scan semantics and may truncate before
  filters are applied.
- Reuse the existing external file upload flow instead of ad hoc Slack upload
  code.
