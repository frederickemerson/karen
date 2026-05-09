# Karen Convex Scaffold

Karen is still local-first in this repo. These Convex files define the intended hosted data model for the public product:

- users and Clerk identity links
- prompt/quiz sessions
- public shame/feed posts
- rewards
- org privacy mode

Required env for a real deployment:

```sh
CONVEX_DEPLOYMENT=dev:your-deployment-name
CONVEX_DEPLOY_KEY=
VITE_CONVEX_URL=
CONVEX_HTTP_ACTIONS_URL=
VITE_CONVEX_SITE_URL=
KAREN_CLOUD_SYNC=1
KAREN_CLOUD_INGEST_SECRET=
CLERK_SECRET_KEY=
VITE_CLERK_PUBLISHABLE_KEY=
```

`CONVEX_HTTP_ACTIONS_URL` or Convex's generated `VITE_CONVEX_SITE_URL` must be the `.convex.site` URL, not the `.convex.cloud` client URL. Karen posts local prompt/session events to `/karen/ingest` when `KAREN_CLOUD_SYNC=1`.

Useful commands:

```sh
bun run convex:dev
bun run convex:deploy
bun run convex:dashboard
```

Do not commit real keys. Any Clerk secret or Convex deploy key shared in chat should be rotated before production use.
