import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
  },
});

const authorizeIngest = (request: Request) => {
  const expected = process.env.KAREN_CLOUD_INGEST_SECRET;
  if (!expected) return { ok: false, status: 503, error: 'ingest_secret_not_configured' };
  if (request.headers.get('authorization') !== `Bearer ${expected}`) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
};

http.route({
  path: '/karen/health',
  method: 'GET',
  handler: httpAction(async () => json({ ok: true, service: 'karen-convex' })),
});

http.route({
  path: '/karen/ingest',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.ingestEvent, body as any);
    return json(result);
  }),
});

http.route({
  path: '/karen/admin/cleanup',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => ({}));
    const mode = body && typeof body === 'object' && (body as any).mode === 'all' ? 'all' : 'smoke';
    const result = await ctx.runMutation(internal.karen.cleanupDevRecordsBySecret, { mode });
    return json({ ok: true, ...result });
  }),
});

http.route({
  path: '/karen/admin/moderate-post',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.moderatePublicPostBySecret, {
      postId: (body as any).postId,
      moderationStatus: (body as any).moderationStatus,
      visibility: (body as any).visibility,
      reason: (body as any).reason,
    });
    return json(result);
  }),
});

http.route({
  path: '/karen/admin/moderate-user',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.moderateUserBySecret, {
      userId: (body as any).userId,
      status: (body as any).status,
      publicProfileEnabled: (body as any).publicProfileEnabled,
      reason: (body as any).reason,
    });
    return json(result);
  }),
});

http.route({
  path: '/karen/admin/reset-user',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.resetUserDataBySecret, {
      userId: (body as any).userId,
      mode: (body as any).mode,
      reason: (body as any).reason,
    });
    return json(result);
  }),
});

http.route({
  path: '/karen/admin/org-settings',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.setOrgSettingsBySecret, {
      orgId: (body as any).orgId,
      mode: (body as any).mode,
      secretScanningEnabled: (body as any).secretScanningEnabled,
      publicPostingEnabled: (body as any).publicPostingEnabled,
      requireClerkForPublicProfiles: (body as any).requireClerkForPublicProfiles,
      allowLocalUsersOnLeaderboard: (body as any).allowLocalUsersOnLeaderboard,
      moderationMode: (body as any).moderationMode,
    });
    return json(result);
  }),
});

export default http;
