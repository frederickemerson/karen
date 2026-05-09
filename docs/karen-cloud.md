# Karen Cloud Plan

Karen currently runs local-first. Cloud mode will use:

- Convex for users, sessions, public posts, leaderboard, rewards, and org policy.
- Clerk for authentication.
- local JSON as the fallback/offline store.

## Environment

Use `.env.local` for real keys:

```sh
CONVEX_DEPLOYMENT=dev:your-deployment-name
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=
NEXT_PUBLIC_CONVEX_URL=
CONVEX_HTTP_ACTIONS_URL=
VITE_CONVEX_HTTP_ACTIONS_URL=
CONVEX_SITE_URL=
VITE_CONVEX_SITE_URL=
KAREN_CLOUD_SYNC=1
KAREN_CLOUD_INGEST_SECRET=
VITE_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_ISSUER_DOMAIN=
```

The project is Vite-based, so browser-visible Clerk config should use `VITE_CLERK_PUBLISHABLE_KEY`. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is only a compatibility alias if a Next.js landing app is split out later.

Use the Convex `.cloud` URL for client subscriptions and the `.site` URL for HTTP actions:

- `VITE_CONVEX_URL`: `https://<deployment>.convex.cloud`
- `CONVEX_HTTP_ACTIONS_URL` or `VITE_CONVEX_SITE_URL`: `https://<deployment>.convex.site`

## Deployment

1. Put real values in `.env.local`.
2. Set `KAREN_CLOUD_INGEST_SECRET` in both `.env.local` and the Convex deployment environment.
3. Set `CLERK_JWT_ISSUER_DOMAIN` in the Convex deployment environment to the Clerk Frontend API URL.
4. Run `bun run convex:dev -- --once` for the dev deployment or `bun run convex:deploy` for production.
5. Check `https://<deployment>.convex.site/karen/health`.
6. Start Karen with `KAREN_CLOUD_SYNC=1 karen`.

Cloud sync is non-blocking. If Convex is offline, Karen still records locally and keeps the agent flow moving. Set `KAREN_CLOUD_DEBUG=1` to print sync failures while developing.

## Security Note

Rotate any Clerk secret or Convex deploy key pasted into chat, issue trackers, logs, or terminals captured by tooling before production use.
