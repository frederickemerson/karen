---
archetype: brief
status: active
---

# Karen Design Brief

The visual and interaction contract for Karen surfaces. A developer is in a terminal late at night, about to hand real code to an agent. The UI must feel like a courtroom arcade cabinet wired into a serious engineering tool.

This brief is immutable intent. Changes require explicit product owner approval and a [decision record](decisions/).

## Purpose

Define the visual language, motion vocabulary, and copy register that make Karen feel like Karen. Every Karen UI surface (terminal CLI, PromptCourt web scoreboard) follows this brief.

## Audience

- Anyone designing or building Karen's terminal CLI output (`packages/karen/`).
- Anyone designing or building the PromptCourt web UI (`packages/ui/src/components/promptcourt/`).
- Agents touching theme tokens, copy, or motion in any Karen surface.

## Tone

- Terminal monospace is the brand voice.
- Compact, high signal, arcade-like.
- Mean about sloppy prompts; never spectacle for its own sake.

## Anti-references

- Generic SaaS dashboard softness.
- Chatbot wrapper with a logo.
- Dark-blue developer tool sameness.
- Verbose instructional copy.

## Strategic principles

- Terminal-safe motion only. No effect should slow the developer down.
- Color carries verdict semantics. Misuse breaks the product.
- Copy is concrete and short. No em dashes.
- The arcade-cabinet aesthetic must never compromise legibility or speed.

## Color

- Terminal base: near-black tinted toward ink, not pure black.
- Primary accent: acidic green for passing judgment.
- Failure accent: hot red for public shame and thrown-out states.
- Warning accent: amber for probation, streak risk, and risky prompts.
- Secondary accent: electric cyan for provider/model/system metadata.

When working on shared UI tokens, reconcile these intents with the inherited theme system (see [AGENTS.md](../../AGENTS.md) Inherited Theme System section).

## Typography

- Terminal monospace is the brand voice.
- Use compact status rows, strong ASCII titles, boxed panels, and short labels.
- Avoid verbose instructional copy.

## Components

- Top status strip: repo, branch, provider, model, streak.
- Left avatar/status block: Karen face, current verdict, profile level.
- Main transcript: user prompts, charges, OpenCode output.
- Command palette: `/help`, `/providers`, `/models`, `/auth`, `/mcp`, `/feed`, `/profile`, `/diff`, `/quit`.
- Quiz mode: full-screen color answer blocks, countdown feeling, music toggle.

## Motion

- Terminal-safe animation only: spinner frames, pulsing verdict text, short thrown-out sequence.

## Copy

- Use concrete labels: Charges, Verdict, Sentence, Appeal, Read Check.
- No em dashes.
