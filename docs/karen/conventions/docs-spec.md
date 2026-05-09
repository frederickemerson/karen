---
archetype: scope
status: active
---

# Karen Docs Spec

This file is the source of truth for how documentation works in the Karen part of this repo. Inherited OpenChamber docs are out of scope and untouched.

## Agent TL;DR

- Karen docs are hierarchical, archetype-based, and validator-enforced.
- Five archetypes only: `module`, `scope`, `operations`, `brief`, `decision`.
- Every Karen surface directory has a `DOCUMENTATION.md`. Every doc has frontmatter declaring its archetype.
- Run `bun run docs:validate:karen` before finalizing any change to Karen code or Karen docs. The validator is in [../../../scripts/docs/validate-karen-docs.mjs](../../../scripts/docs/validate-karen-docs.mjs).
- Adding a new file under any Karen surface requires updating that surface's `DOCUMENTATION.md` `Files` section in the same change. The validator fails otherwise.

## In scope

This spec governs documentation for Karen-added surfaces only:

| Surface | Path | Module doc |
|---|---|---|
| `cli` | `packages/karen/` | `packages/karen/DOCUMENTATION.md` |
| `server` | `packages/web/server/lib/promptcourt/` | `packages/web/server/lib/promptcourt/DOCUMENTATION.md` |
| `ui` | `packages/ui/src/components/promptcourt/` | `packages/ui/src/components/promptcourt/DOCUMENTATION.md` |
| `cloud` | `convex/` | `convex/DOCUMENTATION.md` |

Plus all files under `docs/karen/` and the repo-root [`KAREN.md`](../../../KAREN.md) entry point.

## Out of scope

This spec does not govern:

- Inherited OpenChamber docs: `packages/docs/`, all other `packages/web/server/lib/*/DOCUMENTATION.md`, `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/stores/DOCUMENTATION.md`, `packages/ui/src/components/session/sidebar/DOCUMENTATION.md`, `packages/ui/src/components/chat/message/parts/DOCUMENTATION.md`.
- Inherited topic docs: `docs/REVERSE_PROXY.md`, `docs/CUSTOM_THEMES.md`, `docs/PREVIEW_REMOTE_RELAY.md`, `docs/TAURI_TO_ELECTRON_CUTOVER.md`.
- Repo-root files inherited from the fork: `SECURITY.md`, `CHANGELOG.md`, `README.md` (Karen-flavored but kept as the GitHub entry).
- The Starlight validator `scripts/docs/validate-docs.mjs`. It still validates `packages/docs/`. Do not merge it with the Karen validator.

## How to add a new surface

When Karen grows a new surface (a new top-level directory of Karen-owned code), follow these steps in one PR:

1. Add the surface to the `KAREN_SURFACES` list in [`scripts/docs/validate-karen-docs.mjs`](../../../scripts/docs/validate-karen-docs.mjs).
2. Add the surface to the `In scope` table in this spec and to the module map in [`KAREN.md`](../../../KAREN.md).
3. Create `<new-surface>/DOCUMENTATION.md` using the `module` archetype template below.
4. Reference every non-test, non-generated source file from that surface in the `Files` section of the new `DOCUMENTATION.md`.
5. Run `bun run docs:validate:karen`. It must pass.
6. Run `bun run type-check` and `bun run lint`.

When Karen grows a new file inside an existing surface, only steps 4 and 5 apply.

## Archetypes

Every Karen doc declares exactly one archetype in YAML frontmatter:

```yaml
---
archetype: module        # module | scope | operations | brief | decision
karen-surface: cli       # cli | server | ui | cloud (omit for cross-cutting docs)
status: active           # active | frozen | deprecated
---
```

Required H2 headings per archetype (validator-enforced; additional H2s are allowed):

### module

For a single Karen surface directory's `DOCUMENTATION.md`. Required H2s:

- `Agent TL;DR`
- `Purpose`
- `Files`
- `Contract`
- `Data flow`
- `Invariants`
- `Change rules`
- `Tests`

### scope

For boundary, index, and convention docs. Required H2s:

- `Agent TL;DR`
- `In scope`
- `Out of scope`
- `How to add a new surface`

### operations

For runbooks, install, deploy, env reference. Required H2s:

- `Agent TL;DR`
- `Prerequisites`
- `Environment`
- `Steps`
- `Verify`
- `Rollback`
- `Failure modes`

### brief

For immutable intent (product, design). Required H2s:

- `Purpose`
- `Audience`
- `Tone`
- `Anti-references`
- `Strategic principles`

PR contract: changes to a brief require explicit product owner approval. Briefs are append-only in spirit; corrections are fine, drift is not.

### decision

For ADR-lite records. Required H2s:

- `Context`
- `Decision`
- `Consequences`
- `Date`
- `Status`

Decisions are append-only. To revise a decision, supersede it with a new dated decision and set the old one's `Status` to `superseded`.

## Templates

Copy-paste these into new docs. Replace placeholder content; keep the H2s.

### module template

```markdown
---
archetype: module
karen-surface: <cli | server | ui | cloud>
status: active
---

# <Module name>

## Agent TL;DR

- One line: what this module is.
- One line: when an agent should read it.
- One line: the main contract.
- One line: the gotcha.
- One line: where to look first.

## Purpose

What problem this module solves and why it exists in Karen.

## Files

- `path/to/file.js` - one-line role
- `path/to/another.js` - one-line role

## Contract

Inputs, outputs, public surface. Function signatures or HTTP routes if applicable.

## Data flow

Describe how data enters and exits this module, who calls it, and what it calls.

## Invariants

Hard rules that must not break. Examples: "cloud sync is non-blocking", "privacy redaction runs before storage".

## Change rules

What kinds of changes are safe, what kinds need extra review, what is forbidden.

## Tests

- `path/to/file.test.js` - what it covers
```

### scope template

```markdown
---
archetype: scope
status: active
---

# <Title>

## Agent TL;DR

Short summary of what this boundary defines.

## In scope

What this doc governs.

## Out of scope

What this doc does not govern.

## How to add a new surface

Step-by-step procedure.
```

### operations template

```markdown
---
archetype: operations
status: active
---

# <Operation name>

## Agent TL;DR

One-paragraph summary.

## Prerequisites

What must be true before running this.

## Environment

Env vars and their roles.

## Steps

Numbered steps.

## Verify

How to confirm it worked.

## Rollback

How to undo it.

## Failure modes

Known failure shapes and how to recover.
```

### brief template

```markdown
---
archetype: brief
status: active
---

# <Brief name>

## Purpose

Why this brief exists.

## Audience

Who reads this and acts on it.

## Tone

How copy and decisions should feel.

## Anti-references

What we do not want to look or behave like.

## Strategic principles

Bullet list of immutable principles.
```

### decision template

```markdown
---
archetype: decision
status: active
---

# <NNNN: Decision title>

## Context

What forced the decision.

## Decision

What we chose.

## Consequences

Trade-offs accepted.

## Date

YYYY-MM-DD

## Status

active | superseded by <link> | deprecated
```

## Validator rules

Implemented in [`scripts/docs/validate-karen-docs.mjs`](../../../scripts/docs/validate-karen-docs.mjs). Fails fast with a non-zero exit code if any rule fails.

1. **Surface coverage** - Every directory in `KAREN_SURFACES` has a `DOCUMENTATION.md`.
2. **Frontmatter** - Every Karen doc has a frontmatter block with a valid `archetype`. Optional `karen-surface` and `status` must be from the allowed sets.
3. **Required headings** - Each archetype's required H2 headings are present.
4. **Link integrity** - Every relative link resolves. Absolute URLs, anchors, and root-relative paths are skipped.
5. **Source coverage** - Every non-test, non-generated source file (`.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.jsx`) under a Karen surface is referenced in that surface's `DOCUMENTATION.md` `Files` section. Excluded patterns: `_generated/`, `*.test.*`, `*.spec.*`, `node_modules/`, `dist/`, `build/`. Asset files, package manifests, and Markdown files are not tracked.
6. **Module map** - [`KAREN.md`](../../../KAREN.md) lists every surface's `DOCUMENTATION.md` path verbatim.

## Grow-with-codebase rule

Adding or renaming a tracked source file under any Karen surface in the same PR also updates that surface's `DOCUMENTATION.md` `Files` section. The validator enforces this by failing rule 5 when a new file lacks a reference. Do not bypass with comments or hidden references; the section must be honest.

## CI follow-up

Wiring `bun run docs:validate:karen` into a CI workflow is a separate change. The validator runs locally today; CI integration is tracked as a follow-up.
