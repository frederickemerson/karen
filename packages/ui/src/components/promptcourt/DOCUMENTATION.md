---
archetype: module
karen-surface: ui
status: active
---

# PromptCourt UI

Karen's web scoreboard. The CLI is the product; this surface renders the public side: the bad-prompt graveyard, the badge wall, the leaderboard, the replay tape, the courtroom showcase, and the live profile page. The UI is read-mostly: it queries Convex (when configured) or falls back to PromptCourt server records, never mutates verdicts.

## Agent TL;DR

- 14 components. `KarenCloudProvider` wraps the tree with Convex + Clerk; `PromptCourtPage` is the live profile page; `KarenLandingPage` is the marketing page; everything else is a showcase or panel mounted into one of those two pages.
- All Karen color intent comes from [`../../../../../docs/karen/03-design.md`](../../../../../docs/karen/03-design.md). Use the inherited theme tokens; do not hardcode hex values.
- Live data sources: Convex queries via `useQuery` from `convex/react`, plus the inherited `/api/promptcourt/*` HTTP routes for run streams. Never derive verdicts client-side.
- This surface inherits the OpenChamber app shell, theming, and primitives ([Base UI](https://base-ui.com/), Tailwind v4, the typography helpers in `packages/ui/src/lib/typography.ts`).
- Auth optionality: `isKarenAuthConfigured` gates Clerk-bound subcomponents so the page works without a Clerk publishable key.

## Purpose

Make Karen's records public, glanceable, and arcade-shaped. Convert PromptCourt's structured records into a scoreboard that creates social pressure for prompt discipline without leaking sensitive prompt content.

## Files

- [`PromptCourtPage.tsx`](PromptCourtPage.tsx) - the live profile page. Composes `LaunchControls`, `LiveRunStream`, `RecentSessions`, `ProfilePanel`, `BadPromptGraveyard`, `ProofProfileCard`. Subscribes to `/api/promptcourt/runs/events` SSE for the live run stream and to PromptCourt overview/profile data.
- [`KarenLandingPage.tsx`](KarenLandingPage.tsx) - the public marketing page. Assembles the courtroom showcase, replay tape, badge wall, leaderboard, voice panel, and graveyard into a single scrollable surface.
- [`KarenCloudProvider.tsx`](KarenCloudProvider.tsx) - root provider. Wraps children in `ConvexProviderWithClerk` (when configured) or a no-op fallback. Reads `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY`.
- [`BadPromptGraveyard.tsx`](BadPromptGraveyard.tsx) - card-grid view of blocked-prompt public posts with score-tone classes (awful, weak, appeal) and a share button that copies a redacted excerpt.
- [`KarenBadgeWall.tsx`](KarenBadgeWall.tsx) - reward badges with progress bars and initials, derived from PromptCourt rewards.
- [`KarenReplayTape.tsx`](KarenReplayTape.tsx) - filmstrip animation of a Karen run from prompt -> verdict -> worktree -> quiz -> outcome (promoted or deleted).
- [`CourtroomDemo.tsx`](CourtroomDemo.tsx) - scripted demo transcript of a Karen run for the landing page.
- [`DiffQuizShowcase.tsx`](DiffQuizShowcase.tsx) - mini interactive quiz preview with a countdown.
- [`LiveLeaderboardShowcase.tsx`](LiveLeaderboardShowcase.tsx) - leaderboard view backed by `getOverview` data with rank highlighting.
- [`KarenMascot.tsx`](KarenMascot.tsx) - animated Karen avatar (the courtroom ASCII face translated to vector).
- [`KarenLogo.tsx`](KarenLogo.tsx) - wordmark.
- [`ProofProfileCard.tsx`](ProofProfileCard.tsx) - single-card public profile summary, used standalone and inside the live page.
- [`DeleteOrDefend.tsx`](DeleteOrDefend.tsx) - interactive challenge mini-game where users decide to keep or roll back a generated diff under time pressure.
- [`GrandmaVoicePanel.tsx`](GrandmaVoicePanel.tsx) - settings panel for the Karen voice (mood, ElevenLabs voice id, server-side TTS proxy info, preview). Persists settings to `localStorage` under `KAREN_VOICE_STORAGE_KEY`.

## Contract

Public exports:

- `KarenCloudProvider` - root provider used by the inherited app shell to gate Karen UI behind Convex + Clerk readiness.
- `PromptCourtPage` - the live profile page. Optional `username` prop; falls back to the Clerk identity when configured.
- `KarenLandingPage` - the marketing assembly.
- `BadPromptGraveyard`, `KarenBadgeWall`, `KarenReplayTape`, `CourtroomDemo`, `DiffQuizShowcase`, `LiveLeaderboardShowcase`, `ProofProfileCard`, `DeleteOrDefend`, `GrandmaVoicePanel`, `KarenMascot`, `KarenLogo` - showcase components consumed by the landing and live pages.

Data sources:

- Convex queries (`convex/react`): `karen.overview`, `karen.profile`. Mutations: `karen.upsertCurrentUser` (Clerk-gated).
- Inherited HTTP: `/api/promptcourt/runs`, `/api/promptcourt/runs/events` (SSE), `/api/promptcourt/run` (used by `LaunchControls`).
- `localStorage` for the Grandma voice panel settings only.

Theme tokens used: text/foreground, accent (acidic green), destructive (hot red), warning (amber), info (electric cyan). Reconcile with [`../../../../../docs/karen/03-design.md`](../../../../../docs/karen/03-design.md) and the inherited theme system.

## Data flow

```mermaid
graph TD
  Provider["KarenCloudProvider"] -->|"Convex + Clerk"| LivePage["PromptCourtPage"]
  Provider --> Landing["KarenLandingPage"]
  LivePage -->|"useQuery(karen.overview)"| Convex["convex/karen.ts"]
  LivePage -->|"useQuery(karen.profile)"| Convex
  LivePage -->|"SSE"| Routes["/api/promptcourt/runs/events"]
  LivePage -->|"POST /api/promptcourt/run"| Routes
  Landing --> Showcases["BadPromptGraveyard / KarenBadgeWall / KarenReplayTape / LiveLeaderboardShowcase / CourtroomDemo / DiffQuizShowcase / DeleteOrDefend / GrandmaVoicePanel"]
  Showcases -->|"Convex queries when available"| Convex
  Showcases -.->|"static demo data when offline"| FallbackData["bundled demo records"]
```

`KarenCloudProvider` is the gate. When Convex/Clerk are not configured (`VITE_CONVEX_URL` or `VITE_CLERK_PUBLISHABLE_KEY` missing), the provider rendres children directly and Convex-backed components fall back to bundled demo data so the landing page still renders.

## Invariants

- **No verdict logic in the UI.** Verdicts come from the server (`evaluatePrompt`) via Convex or HTTP. The UI may color-code verdicts but must not invent them.
- **Theme tokens only.** No raw hex values, no Tailwind palette colors. Karen colors map to inherited tokens (see [`../../../../../docs/karen/03-design.md`](../../../../../docs/karen/03-design.md)).
- **Live state vs historical state.** Live run streams come from SSE; historical sessions and posts come from Convex queries. Never let historical state masquerade as live activity.
- **Auth-optional rendering.** Every Clerk-bound feature must render gracefully when `isKarenAuthConfigured` is false. The landing page must work for an anonymous visitor.
- **Public posts are pre-redacted.** Components must not attempt to re-derive prompts from posts; they only render `promptExcerpt` and `failureReasons`.
- **Memoize heavy lists.** Leaderboard, graveyard, replay tape, and badge wall are render-fanout boundaries. Use stable item keys and avoid container-level subscriptions per the inherited performance rules.

## Change rules

- New Karen UI components belong in this directory. If they need cross-surface logic, the logic lives in [`../../../../web/server/lib/promptcourt/`](../../../../web/server/lib/promptcourt/) or [`../../../../../convex/`](../../../../../convex/) and is queried, not duplicated here.
- New visual ideas must reconcile with [`../../../../../docs/karen/03-design.md`](../../../../../docs/karen/03-design.md). Color and motion changes that drift from the brief require a [decision record](../../../../../docs/karen/decisions/).
- Convex schema changes that affect UI shapes must update both [`../../../../../convex/karen.ts`](../../../../../convex/karen.ts) public views and the consuming components in the same change.
- Any new env var the UI reads must use the `VITE_` prefix and be documented in [`../../../../../docs/karen/operations/env.md`](../../../../../docs/karen/operations/env.md).
- Use Base UI primitives and the wrappers in `../ui/`. Do not pull in new UI libraries without explicit approval.
- Toasts go through the inherited wrapper from `@/components/ui`. Do not import `sonner` directly.

## Tests

There are no Karen-specific UI unit tests in this directory yet. End-to-end coverage comes from the Playwright smoke test:

```sh
bun run test:karen-gui      # tests/karen-gui.spec.ts
```

When adding interactive components (e.g., new mini-games or settings panels), add a Playwright case to the GUI smoke and reference it here.
