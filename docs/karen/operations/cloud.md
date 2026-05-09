---
archetype: operations
status: active
---

# Karen Cloud (Convex + Clerk)

How to deploy and operate Karen's optional cloud layer. Karen runs local-first; cloud mode adds public profiles, leaderboard, and org policy.

## Agent TL;DR

Cloud is Convex (data + HTTP actions) plus Clerk (auth). Karen records locally first; cloud sync is best-effort and non-blocking. Set up Convex, set the ingest secret in both `.env.local` and the Convex deployment, set the Clerk JWT issuer in the Convex deployment, deploy, then start Karen with `KAREN_CLOUD_SYNC=1`. Failures must never stall the agent flow.

## Prerequisites

- A Convex account and a deployment (dev or production).
- A Clerk application with a publishable key and secret key.
- Node 20+ and Bun installed locally.
- `.env.local` at the repo root (loaded by Vite via `envDir` in [`packages/web/vite.config.ts`](../../../packages/web/vite.config.ts) and by the server in [`packages/web/server/lib/promptcourt/cloud.js`](../../../packages/web/server/lib/promptcourt/cloud.js)).

## Environment

Put real values in `.env.local`. The full reference is in [env.md](env.md). Cloud-relevant subset:

```sh
CONVEX_DEPLOYMENT=dev:your-deployment-name
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=https://<deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_HTTP_ACTIONS_URL=https://<deployment>.convex.site
VITE_CONVEX_HTTP_ACTIONS_URL=https://<deployment>.convex.site
CONVEX_SITE_URL=https://<deployment>.convex.site
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
KAREN_CLOUD_SYNC=1
KAREN_CLOUD_INGEST_SECRET=
VITE_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=
```

This project is Vite-based, so browser-visible Clerk config uses `VITE_CLERK_PUBLISHABLE_KEY`. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is only a compatibility alias if a Next.js landing app is split out later.

Convex URLs split between `.cloud` and `.site`:

- `VITE_CONVEX_URL`: `https://<deployment>.convex.cloud` for client subscriptions.
- `CONVEX_HTTP_ACTIONS_URL` / `VITE_CONVEX_SITE_URL`: `https://<deployment>.convex.site` for HTTP actions.

## Steps

1. Put real values in `.env.local`.
2. Set `KAREN_CLOUD_INGEST_SECRET` in both `.env.local` and the Convex deployment environment.
3. Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex deployment environment to the Clerk Frontend API URL.
4. Run `bun run convex:dev -- --once` for the dev deployment, or `bun run convex:deploy` for production.
5. Confirm functions deployed in the Convex dashboard (`bun run convex:dashboard`).
6. Start Karen with `KAREN_CLOUD_SYNC=1 karen`.

## Verify

- Hit `https://<deployment>.convex.site/karen/health` and confirm a 200 response.
- Run `bun run test:promptcourt` locally; cloud-sync tests in [`packages/web/server/lib/promptcourt/cloud.test.js`](../../../packages/web/server/lib/promptcourt/cloud.test.js) must pass.
- Trigger a Karen verdict and confirm a record lands locally first, then appears in Convex tables defined in [`convex/schema.ts`](../../../convex/schema.ts).
- Set `KAREN_CLOUD_DEBUG=1` while developing to print sync failures inline.

## Rollback

- To disable cloud at runtime without redeploying: `unset KAREN_CLOUD_SYNC` (or set to anything other than `1`). Karen falls back to local JSON storage; no agent flow disruption.
- To revert a Convex deployment: redeploy the previous schema/functions tag with `bun run convex:deploy` against the same deployment slug. Convex retains historical function versions in the dashboard.
- To rotate a leaked secret: rotate in Clerk or Convex dashboards, update `.env.local` and the Convex deployment env, restart Karen.

## Failure modes

- **Convex offline.** Karen must keep the agent flow moving. Local recording is authoritative; sync resumes when Convex is reachable.
- **Clerk JWT mismatch.** If `CLERK_JWT_ISSUER_DOMAIN` in the Convex deployment does not match the Clerk Frontend API URL, ingestion will reject all writes. Symptom: 401 on `https://<deployment>.convex.site/karen/*` calls.
- **Missing ingest secret.** Karen will surface a configuration error and skip cloud sync. Fix by setting `KAREN_CLOUD_INGEST_SECRET` in both `.env.local` and the Convex deployment to the same value.
- **Wrong Convex URL split.** Using `.convex.cloud` for HTTP actions, or `.convex.site` for client subscriptions, will produce hard-to-debug 404s. Keep the split correct.

## Security

Rotate any Clerk secret or Convex deploy key pasted into chat, issue trackers, logs, or terminals captured by tooling before production use. The Karen server logs must never include `KAREN_CLOUD_INGEST_SECRET`, `CLERK_SECRET_KEY`, or `CONVEX_DEPLOY_KEY` values.
