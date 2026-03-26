---
name: slack-app-initial-setup-support
description: Use when guiding the first installation or deployment of this app into a Slack workspace. Base each step on docs/setup-guide.md, separate local work from human confirmation, and surface documentation drift.
---

# Slack App Initial Setup Support

Use this skill when the user wants help installing this repository's Slack app
into a workspace for the first time.

## Primary Source

- Treat `docs/setup-guide.md` as the source of truth for setup order,
  prerequisites, verification points, and troubleshooting.
- Re-open `docs/setup-guide.md` before answering questions about exact commands,
  required inputs, or Workflow Builder settings.
- If the repository state or current Slack behavior differs from the guide, call
  out the mismatch explicitly and suggest updating `docs/setup-guide.md` instead
  of silently inventing a new flow.

## Support Mode

- This skill is for guided setup support, not blind end-to-end automation.
- Separate actions into two buckets:
  - agent-executable local work such as checking files, preparing commands,
    validating config, and running safe repository checks
  - human-confirmed work such as Slack workspace selection, app installation,
    channel participation, Workflow Builder configuration, and production
    rollout decisions
- For steps that happen in Slack or SORACOM screens, tell the user what to
  verify and avoid assuming success without a confirmation or an observed local
  result.
- Keep the conversation anchored to one phase at a time: prerequisites,
  repository preparation, Slack deploy, Workflow Builder setup, verification, or
  troubleshooting.

## Workflow

1. Read `docs/setup-guide.md` and identify the user's current setup phase.
2. Inspect local prerequisites only when they matter for the next step:
   - repository checkout and branch state
   - `.env` presence and placeholder values
   - `slack.json` deployment configuration
   - commands from the guide such as `deno task check`, `deno task test`, and
     `slack deploy --env production`
3. Give the next smallest useful step with:
   - the exact command or file to touch
   - the expected success signal
   - the human confirmation needed in Slack
4. Before advancing, restate the completion criteria for that phase using
   `docs/setup-guide.md`.
5. When something fails, troubleshoot against the guide's `よくある詰まりどころ`
   section first, then inspect repository-specific configuration if needed.

## Guardrails

- Do not treat `slack run` as sufficient for Workflow Builder availability; the
  guide requires `slack deploy --env production`.
- Do not edit secrets or production workspace settings unless the user clearly
  asked for that change.
- Prefer flagging missing or placeholder configuration over auto-filling values.
- Call out human checkpoints explicitly for channel membership, private channel
  invitations, and post-deploy verification.
- If you discover recurring setup drift, propose a doc update and make that
  change when the user asks for it.
