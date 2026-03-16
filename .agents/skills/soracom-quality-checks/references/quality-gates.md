# Quality Gates

## Code review priorities

- Missing test coverage for changed behavior
- Missing i18n updates for new strings
- Missing `manifest.ts` registration for new Functions or Workflows
- Unsafe API response access without success checks
- Silent error swallowing or string throws

## Commands

```bash
deno task fmt
deno task lint
deno task check
deno task test
deno task i18n:check
deno task i18n:test
```

## When to run what

- `deno task test`: any behavior change
- `deno task check`: type-level or manifest-affecting change
- `deno task i18n:check`: added or changed locale keys
- `deno task i18n:test`: touched `lib/i18n/` or locale loading behavior

## Reporting expectations

- If validation was not run, say so explicitly.
- If only docs changed, note that runtime checks were not needed.
- In review mode, list findings first with file references and concrete impact.
