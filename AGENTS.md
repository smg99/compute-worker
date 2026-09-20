# Compute Worker — AI Working Context
# Project Context

## Purpose
Browser-extension compute worker/backend supporting the Founder X worker system.

## Agent priorities
- Understand the existing product and user flow before changing architecture.
- Preserve working behavior, analytics, SEO/discoverability, integrations, and deployment assumptions unless the task explicitly changes them.
- Prefer small, evidence-backed changes over speculative rewrites or new infrastructure.
- Do not add paid runtime dependencies or services without explicit approval.
- Never fabricate production data, metrics, integrations, or successful verification.
- Check `git status` first and never discard unrelated local work.
- Keep secrets and credentials out of source control and documentation.

## Project shape
- Primary stack: TypeScript.
- Read `README.md` and any project-specific plan/runbook/docs before substantial changes.

## Common commands
- `test`: `npm run test`
- `build`: `npm run build`

## Safe change workflow

1. Inspect repository status and relevant documentation.
2. Reproduce or establish the requested behavior before editing.
3. Make the smallest coherent change.
4. Run the relevant tests/lint/build available in this repository.
5. Review the diff and commit only task-related files.
6. Push/deploy only when requested or when that is the established project workflow, then verify the real target.

## Documentation rule
Keep this file focused on durable project intent and guardrails. Put volatile implementation status in README/status/runbook files rather than letting `AGENTS.md` become stale.
