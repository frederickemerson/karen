---
archetype: operations
status: active
---

# Security Audit 2026-05-18

## Agent TL;DR

This is a documentation-only security audit of Karen after pulling `origin/main` on 2026-05-18. The audit separates the two trust zones Karen runs in: the OpenChamber webserver plus Convex cloud interfaces, and the local user-space terminal/CLI interfaces. No fixes are implemented here; this record captures the issues raised, independent critique, confidence, and remediation order.

## Prerequisites

- Worktree: `replay-reprimand`.
- Baseline after pull: `bc16cb96` from `origin/main`.
- Audit command run: `bun audit`.
- Scope docs read: [`../../../KAREN.md`](../../../KAREN.md), [`../00-scope.md`](../00-scope.md), [`../01-architecture.md`](../01-architecture.md), and the relevant surface `DOCUMENTATION.md` files.
- Independent review: two fresh-context subagents reviewed the web/cloud and local findings without relying on the first-pass conclusions.

## Environment

Interfaces considered:

- **Webserver/local HTTP surface:** [`../../../packages/web/server/lib/promptcourt/routes.js`](../../../packages/web/server/lib/promptcourt/routes.js), [`../../../packages/web/server/lib/promptcourt/gui-run.js`](../../../packages/web/server/lib/promptcourt/gui-run.js), [`../../../packages/web/server/lib/promptcourt/replay-video-routes.js`](../../../packages/web/server/lib/promptcourt/replay-video-routes.js), [`../../../packages/web/server/lib/promptcourt/storage.js`](../../../packages/web/server/lib/promptcourt/storage.js).
- **Convex cloud surface:** [`../../../convex/http.ts`](../../../convex/http.ts), [`../../../convex/karen.ts`](../../../convex/karen.ts), [`../../../convex/schema.ts`](../../../convex/schema.ts).
- **Local user-space surface:** [`../../../packages/karen/bin/karen.js`](../../../packages/karen/bin/karen.js), [`../../../packages/karen/lib/karen-auth.js`](../../../packages/karen/lib/karen-auth.js), [`../../../packages/karen/lib/karen-voice.js`](../../../packages/karen/lib/karen-voice.js), and the inherited commit guard in [`../../../packages/web/server/lib/opencode/git-commit-guard.js`](../../../packages/web/server/lib/opencode/git-commit-guard.js).

The separated nature matters:

- The webserver can be reached by browsers, local processes, tunnels, or remote binds depending on deployment.
- The CLI runs locally in user space and must protect the user's tree even when OpenCode or generated commands behave unexpectedly.

## Steps

1. Pull latest from GitHub.
   - Plain `git pull` failed because the branch had no upstream.
   - `git pull --ff-only origin main` succeeded and fast-forwarded to `bc16cb96`.
2. Run dependency audit.
   - `bun audit` reported 46 vulnerabilities: 23 high, 22 moderate, 1 low.
3. Inspect Karen docs and code paths for server/cloud and local user-space interfaces.
4. Spawn independent reviewers to challenge the findings.
5. Record only issues that survived review, with confidence and correction notes where reviewers found claims overstated.

### Verified Webserver And Cloud Issues

1. **High: PromptCourt mutating/execution routes are not consistently authenticated.**
   - Auth middleware is applied only to `/api/promptcourt/profile`, `/api/promptcourt/feed`, `/api/promptcourt/runs`, and `/api/promptcourt/gui-runs` in [`../../../packages/web/server/lib/promptcourt/routes.js`](../../../packages/web/server/lib/promptcourt/routes.js).
   - Unprotected routes include `/api/promptcourt/evaluate`, `/api/promptcourt/run`, `/api/session/:sessionId/prompt_async`, and `/api/promptcourt/replay/export`.
   - Risk: callers that can reach the webserver can write PromptCourt records, launch terminal Karen runs, or forward approved prompts to OpenCode.
   - Confidence: high.
   - Remediation: require PromptCourt session or equivalent UI auth on all mutating routes, add origin/CSRF checks for browser requests, and bind OpenCode session IDs to authenticated UI sessions.

2. **High: local PromptCourt overview leaks local records.**
   - `/api/promptcourt/overview` is public while `store.getOverview()` returns profiles and session-derived data.
   - Risk: a caller that can reach the server can read local prompt history excerpts and scoreboard state.
   - Confidence: high.
   - Remediation: protect overview with the same session middleware or split it into a public-safe shape that omits sessions and prompt text.

3. **Medium: replay export is unauthenticated and writes server-side artifacts.**
   - `/api/promptcourt/replay/export` accepts caller-supplied events or reads run events and writes an artifact under the OpenChamber data dir.
   - Risk: data exposure, local path disclosure in response payloads, and disk/storage abuse.
   - Confidence: high.
   - Correction from independent review: path traversal was not substantiated because replay IDs are slugified before filename construction.
   - Remediation: require auth, cap artifact count/age, rate limit, and omit absolute filesystem paths from HTTP responses.

4. **Medium: Convex voice endpoint can spend ElevenLabs quota.**
   - `/karen/voice/synthesize` is public, permits arbitrary short text, accepts caller-selected `voiceId`, and uses the deployment's `ELEVENLABS_API_KEY`.
   - Risk: paid quota burn and unbounded cached audio growth.
   - Confidence: high for quota exposure; medium for rate-limit bypass depending on Convex header behavior.
   - Remediation: require signed or authenticated requests, default CORS to deny unless origins are configured, restrict voice IDs to an allowlist, add daily quota, and clean up cached blobs.

5. **Medium: public Convex rate limits trust forwarding headers.**
   - Device start/poll and voice synthesis derive rate-limit keys from `x-forwarded-for` / `x-real-ip`.
   - Risk: if Convex preserves caller-supplied headers, attackers can rotate fake IP buckets and create device-link rows or voice requests.
   - Confidence: medium, platform-dependent.
   - Remediation: use trusted platform IP metadata or a trusted proxy boundary, ignore untrusted forwarding headers, add global caps, and clean expired pending device codes.

6. **Medium: device-token ingest can still use body-supplied org/profile policy fields.**
   - `/karen/ingest` overrides user identity for device-token auth, but `ingestEvent` still appears to use body-supplied `session.clerkOrgId` and `session.clerkUserId` for org/profile policy checks.
   - Risk: a valid device token holder may influence policy selection fields even though ownership is token-bound.
   - Confidence: medium-high from independent review.
   - Remediation: when device-token auth is used, derive all identity and policy fields from the verified token/user record, not request body.

7. **Low/medium: generated PromptCourt session token is logged.**
   - When `KAREN_PROMPTCOURT_SESSION_TOKEN` is unset, the generated token is printed to server logs.
   - Risk: anyone with logs can call protected PromptCourt APIs.
   - Confidence: high.
   - Remediation: log only that a token was generated, not its value.

8. **Low: raw prompt text can enter run-event details.**
   - `/api/promptcourt/run` records `prompt.slice(0, 120)` as event details before redaction.
   - Risk: secrets in a prompt can land in local run-event storage even though sessions/posts are redacted.
   - Confidence: high.
   - Remediation: redact all run-event labels/details before storage.

### Verified Local User-Space Issues

1. **High: guarded worktree isolation can be escaped through symlinks.**
   - Tracked symlinks arrive from `git worktree add`; untracked paths are copied with `fs.cpSync`; there is no `lstat`/`realpath` boundary scan before OpenCode runs inside the temp worktree.
   - Risk: an agent writing through a symlinked path can modify files outside the temp worktree before the quiz result; cleanup only removes the temp worktree.
   - Confidence: high.
   - Remediation: after checkout and untracked mirroring, walk the worktree with `lstat`; reject or neutralize symlinks resolving outside the temp worktree. Add self-checks for tracked and untracked symlink escapes.

2. **High: raw passthrough commands intentionally bypass PromptCourt.**
   - `/run`, `/tui-raw`, and `/opencode ...` call OpenCode directly in the real cwd and bypass PromptCourt, worktree isolation, and read-check promotion.
   - Risk: the Karen shell exposes an in-product local policy bypass.
   - Confidence: high.
   - Remediation: route `/run` through the guarded flow by default; keep only clearly read-only passthroughs; require explicit unsafe confirmation or flags for raw mutating passthroughs.

3. **Medium: PromptCourt local JSON store is not permission-hardened.**
   - `promptcourt.json` is written with default directory/file permissions, unlike auth token storage which chmods to `0600`.
   - Risk: on hosts with permissive umask or shared home/config permissions, other local users may read prompt records, profile data, and run events.
   - Confidence: high.
   - Remediation: create the data directory as `0700`, write temp/final state files as `0600`, chmod after rename, and reject symlinked state paths.

4. **Medium: commit guard can be bypassed by Git config override.**
   - The CLI guarded worktree path relies on installed hooks; OpenCode is spawned with the normal environment. A git invocation can potentially override `core.hooksPath` or use an absolute Git binary to bypass wrapper-style enforcement.
   - Risk: the agent commits inside the isolated worktree, moving `HEAD`; `git diff HEAD` can miss generated changes and skip quiz/promotion.
   - Confidence: medium.
   - Remediation: record the baseline commit SHA and fail the run if `HEAD` changes unexpectedly; also wrap `PATH` with the git commit guard runtime for child processes.

### Dependency Audit

`bun audit` reported 46 vulnerabilities:

- 23 high
- 22 moderate
- 1 low

Notable packages or paths include:

- `simple-git <3.36.0` high severity RCE advisory.
- `vite` high/moderate dev-server file-read/path traversal advisories.
- `undici` high/moderate WebSocket, smuggling, and DoS advisories.
- `tar` high file overwrite/path traversal advisories through Electron build tooling.
- `@clerk/clerk-react` high authorization bypass advisory.
- `serialize-javascript`, `lodash`, `path-to-regexp`, `picomatch`, `fast-uri`, `dompurify`, `postcss`, `yaml`, and others.

This audit did not update dependencies. A follow-up dependency remediation PR should separate runtime-facing risk from dev/build-only risk and verify Bun lockfile changes.

### Claims Adjusted By Independent Review

- Shell metacharacter injection through `/api/promptcourt/run` was not substantiated; the command values are shell-quoted. The real issue is missing auth plus terminal launch.
- Replay path traversal was not substantiated; replay IDs are slugified. The real issue is unauthenticated artifact creation, local path disclosure, and storage abuse.
- Convex admin HTTP routes are authenticated by shared secret and admin actor header. The risk is secret power/leakage and operational blast radius, not absent auth.

## Verify

This PR only adds documentation. Verification performed:

- `bun audit` completed and returned the vulnerability list above.
- Two independent subagents reviewed the findings in fresh contexts:
  - Web/cloud critique confirmed missing auth on PromptCourt routes, replay export risk, spoofable header rate limits, session-token logging, and added the device-token policy-field concern.
  - Local critique confirmed symlink isolation escape, raw passthrough bypass, store permissions, commit guard bypass, and unauthenticated local HTTP action routes.

Recommended verification before implementing fixes:

- Add HTTP route tests asserting unauthenticated requests fail for every mutating PromptCourt endpoint.
- Add symlink escape self-checks under `packages/karen/self-check/`.
- Add file mode tests for `promptcourt.json` and its parent directory.
- Add commit-guard tests for `git -c core.hooksPath=... commit --no-verify` and unexpected `HEAD` movement.
- Add Convex tests or deployment smoke checks for device-token identity override and voice/device rate-limit behavior.

## Rollback

This branch is documentation-only. Rollback is simply removing this file or closing the draft PR. No runtime behavior, schema, dependencies, or generated artifacts are changed.

## Failure modes

- **Audit severity changes after deployment-context review.** Some webserver findings are highest risk when OpenChamber is remotely reachable or tunneled. If the server is strictly localhost-only, remote severity drops but local cross-process and browser-origin risks remain.
- **Platform IP behavior differs.** Convex may normalize or preserve forwarding headers depending on the hosting path. Treat header-based rate limits as suspect until verified against the deployed edge.
- **Dependency audit noise.** `bun audit` includes dev/build-only transitive packages. Triage should separate production runtime exposure from tooling exposure before bulk updating.
- **Documentation goes stale.** Once fixes land, update this audit or supersede it with a new dated record rather than silently editing away the historical findings.
