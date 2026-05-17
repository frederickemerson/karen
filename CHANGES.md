# GUI MAIN APP — Tasks #14 / #15 / #17

## Task #14 — PromptCourt as a sidebar tab inside the OpenChamber main app

- `packages/ui/src/stores/useUIStore.ts` — extended `MainTab` union with `'promptcourt'`. No persist changes needed (the existing `activeMainTab` key already round-trips arbitrary strings).
- `packages/ui/src/components/layout/MainLayout.tsx` — lazy-imported `PromptCourtPanel` and added a `case 'promptcourt'` branch to `secondaryView` so the panel renders inline as the main area (matches frame_007).
- `packages/ui/src/components/layout/Header.tsx` — added a desktop `PromptCourt` action button (using `RiAuctionLine`) next to the Plan icon; clicking toggles `activeMainTab` between `'chat'` and `'promptcourt'`. Added a mobile tab entry between Plan and Diff so the tab appears in the mobile tab strip. The pre-existing "reset non-chat tabs to chat on desktop" effect leaves `'promptcourt'` alone.
- `packages/ui/src/components/promptcourt/PromptCourtPanel.tsx` — new. Header with `KarenLogo`, discipline-score and streak pills, plus `KarenAuthBar`. Streams `/api/promptcourt/runs/events` SSE for the live run feed, queries Convex (or HTTP-polls when cloud isn't configured) for the user profile and overview, renders recent verdicts off `profile.recentSessions`, and renders the public bad-prompt feed via the existing `BadPromptGraveyard`. When `?run=<id>` is present in the SPA URL, hydrates that guarded run and subscribes to its per-run SSE; when the run reaches `quiz_required`, the panel swaps the main area to `DiffReviewPanel`. All colors use design tokens (`bg-card`, `border-border`, `var(--status-*)`).

Matches frame_007.

## Task #15 — GUI multi-choice quiz overlay

- `packages/ui/src/components/promptcourt/KarenQuizGameModal.tsx` — extended `stage` type with `'reset'`. On a wrong answer, the modal now flips to the `reset` stage, plays the existing `quiz-fail` audio, fires the `onFailed` callback, and renders a full-screen red `GitResetCard` overlay (absolute `inset-0`, z-10) with the "REDO UR WORK" badge, the `GIT RESET --HARD` headline, and the "Sandbox deleted. Real repo stays clean." subtext. After 3.5s the modal transitions to the existing `wrong` review panel so the user still sees the correct answer + explanation.

Matches frames 009 and 015.

## Task #17 — "Don't know what you changed?" diff-review page

- `packages/ui/src/components/promptcourt/DiffReviewPanel.tsx` — new. Accepts `{ run, onStartQuiz }`. Parses the unified diff into per-file rows with +N/-M counts, supports per-file expand/collapse showing hunks with monospace diff colorization, surfaces the diff source and any diff note, renders the warning row "Karen will ask you 5 questions about this diff. Wrong = git reset --hard.", and exposes the "Take the read check →" CTA that calls `onStartQuiz`.
- Wired into `PromptCourtPanel` via the `showDiffReview` flag: when `activeGuiRun.status === 'quiz_required'` with a non-empty quiz, the panel renders `DiffReviewPanel` in place of the live-runs / recent-verdicts / graveyard grid. Clicking the CTA sets `quizModalOpen` and mounts `KarenQuizGameModal`.

Matches the "Don't know what you changed?" main panel in frame_007 plus the quiz handoff in frame_015.

## Docs

- `packages/ui/src/components/promptcourt/DOCUMENTATION.md` — added `PromptCourtPanel.tsx` and `DiffReviewPanel.tsx` to the file inventory; updated `KarenQuizGameModal.tsx` entry to describe the new reset stage; added both new components to the public contract section. Standalone `/karen` route preserved as a fallback.

## Verification

`bun run --cwd packages/ui type-check` — clean.
