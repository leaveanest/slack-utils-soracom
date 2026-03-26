---
name: soracom-quality-checks
description: Use when reviewing, hardening, or finishing changes in this repository. Trigger for CI failures, test gaps, i18n updates, manifest registration checks, Slack or SORACOM API error handling, and pre-merge validation.
---

# Slack SORACOM Validation

Use this skill when the main task is correctness, review, or release readiness.

## Validation Order

1. Check whether the change touched feature code, translations, manifest wiring,
   shared SORACOM logic, Slack upload helpers, or Datastore-backed job/state
   modules.
2. Review repository-specific risks first:
   - missing `manifest.ts` registration
   - missing `functions/<name>/test.ts` updates
   - untranslated or hard-coded user-facing strings
   - weak API error handling
   - Slack Platform timeout or rate-limit blind spots
   - trigger additions that conflict with the repo's "sample only" policy
3. Run the narrowest command that proves the change, then the broader suite if
   the change spans multiple areas.
4. If asked for a review, prioritize bugs, regressions, and missing tests before
   summary.

## What To Enforce

- Tests cover normal and error paths.
- User-facing strings use `t()` and locale keys exist in both `locales/en.json`
  and `locales/ja.json`.
- API responses are checked before field access.
- Errors are raised as `Error` objects, not strings.
- DM-specific flows use the correct Slack path (`SendDm` or equivalent existing
  pattern), not a generic channel sender.
- File upload changes reuse the existing external upload flow instead of
  reintroducing deprecated APIs.
- `conversations.history` callers account for bot membership, pagination, and
  rate limits.
- Datastore queries do not misuse `limit` as a post-filter row count.
- Long-running collection/export work is broken up when Slack Platform runtime
  limits would make the synchronous path fragile.
- Report clearly when validation was skipped or could not be run.

Read `references/quality-gates.md` for the exact checklist and commands.
