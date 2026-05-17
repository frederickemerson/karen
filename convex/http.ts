import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json',
    'cache-control': 'no-store',
  },
});

// Shared-secret ingest (server-to-server, e.g. the Express PromptCourt cloud sync path).
const authorizeIngestSecret = (request: Request) => {
  const expected = process.env.KAREN_CLOUD_INGEST_SECRET;
  if (!expected) return { ok: false as const, status: 503, error: 'ingest_secret_not_configured' };
  if (request.headers.get('authorization') !== `Bearer ${expected}`) {
    return { ok: false as const, status: 401, error: 'unauthorized' };
  }
  return { ok: true as const };
};

// Back-compat alias for the rest of this file's admin routes.
const authorizeIngest = authorizeIngestSecret;

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await (globalThis as any).crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
};

const randomBase64Url = (byteLength: number): string => {
  const buffer = new Uint8Array(byteLength);
  (globalThis as any).crypto.getRandomValues(buffer);
  let binary = '';
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateUserCode = () => {
  const buffer = new Uint8Array(8);
  (globalThis as any).crypto.getRandomValues(buffer);
  let out = '';
  for (let i = 0; i < buffer.length; i += 1) out += USER_CODE_ALPHABET[buffer[i] % USER_CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}`;
};

const clientIp = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first.startsWith('::ffff:') ? first.slice(7) : first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real;
  return 'no-ip';
};

// Authorize a device token. Returns the resolved (userId, clerkUserId) on success.
const authorizeDeviceToken = async (ctx: any, request: Request) => {
  const header = request.headers.get('authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token || token.length < 16) return null;
  const tokenHash = await sha256Hex(token);
  const result: any = await ctx.runQuery(internal.karen.verifyDeviceToken, { tokenHash });
  if (!result) return null;
  // Touch lastUsedAt asynchronously; ignore failure.
  try {
    await ctx.runMutation(internal.karen.touchDeviceToken, { tokenId: result.tokenId });
  } catch {
    // best-effort
  }
  return result;
};

const requireAdminActor = (request: Request) => {
  const actor = request.headers.get('x-karen-admin-actor');
  if (!actor || actor.trim().length === 0) {
    return { ok: false as const, status: 400, error: 'missing_admin_actor' };
  }
  return { ok: true as const, actor: actor.trim() };
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
    // Two trust boundaries:
    //   1. Shared-secret bearer: server-to-server ingest from the Express PromptCourt path.
    //   2. Device-token bearer:  per-user TUI ingest from a logged-in CLI.
    // Try the shared secret first (cheaper), then fall back to device token.
    const expectedSecret = process.env.KAREN_CLOUD_INGEST_SECRET;
    const authHeader = request.headers.get('authorization');
    const isSharedSecret = Boolean(expectedSecret) && authHeader === `Bearer ${expectedSecret}`;

    let authIdentity: { userId: any; clerkUserId: string } | null = null;
    if (!isSharedSecret) {
      const verified = await authorizeDeviceToken(ctx, request);
      if (!verified) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }
      authIdentity = { userId: verified.userId, clerkUserId: verified.clerkUserId };
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const payload = authIdentity
      ? { ...(body as any), authClerkUserId: authIdentity.clerkUserId, authUserId: authIdentity.userId }
      : (body as any);

    const result = await ctx.runMutation(internal.karen.ingestEvent, payload);
    return json(result);
  }),
});

// ---------------------------------------------------------------------------
// RFC 8628 device-link flow
// ---------------------------------------------------------------------------

http.route({
  path: '/karen/auth/device/start',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const ip = clientIp(request);
    const rate: any = await ctx.runMutation(internal.karen.checkIpRateLimit, { key: `device-start:${ip}` });
    if (!rate.allowed) {
      return json({ ok: false, error: 'rate_limited', retryAfterMs: rate.retryAfterMs }, 429);
    }
    const body = await request.json().catch(() => ({}));
    const deviceLabel = body && typeof (body as any).deviceLabel === 'string'
      ? (body as any).deviceLabel.slice(0, 80)
      : undefined;

    const deviceCode = randomBase64Url(32);
    const deviceCodeHash = await sha256Hex(deviceCode);

    // Generate a user code and retry once on collision.
    let userCode = generateUserCode();
    let collides: boolean = await ctx.runQuery(internal.karen.userCodeExists, { userCode });
    if (collides) {
      userCode = generateUserCode();
    }

    try {
      await ctx.runMutation(internal.karen.startDeviceLink, { deviceCodeHash, userCode, deviceLabel });
    } catch (err: any) {
      return json({ ok: false, error: 'start_failed', message: String(err?.message ?? err) }, 500);
    }

    const baseVerifyUrl = process.env.KAREN_CLOUD_LINK_URL;
    if (!baseVerifyUrl) {
      return json(
        {
          ok: false,
          error: 'link_url_not_configured',
          message:
            'KAREN_CLOUD_LINK_URL is not set in the Convex deployment. Set it to the public URL of the /link page (for example https://your-app.vercel.app/link) before karen login can start a device flow.',
        },
        500,
      );
    }
    return json({
      deviceCode,
      userCode,
      verificationUri: baseVerifyUrl,
      verificationUriComplete: `${baseVerifyUrl}?code=${encodeURIComponent(userCode)}`,
      expiresIn: 600,
      interval: 5,
    });
  }),
});

http.route({
  path: '/karen/auth/device/poll',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const ip = clientIp(request);
    const rate: any = await ctx.runMutation(internal.karen.checkIpRateLimit, { key: `device-poll:${ip}` });
    if (!rate.allowed) {
      return json({ ok: false, error: 'rate_limited', retryAfterMs: rate.retryAfterMs }, 429);
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof (body as any).deviceCode !== 'string') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }
    const deviceCode = String((body as any).deviceCode);
    if (deviceCode.length < 16) return json({ ok: false, error: 'access_denied' }, 400);
    const deviceCodeHash = await sha256Hex(deviceCode);

    const poll: any = await ctx.runMutation(internal.karen.pollDeviceCode, { deviceCodeHash });
    if (poll.status === 'ready') {
      const opaqueToken = randomBase64Url(32);
      const tokenHash = await sha256Hex(opaqueToken);
      try {
        const exchange: any = await ctx.runMutation(internal.karen.exchangeDeviceCode, {
          deviceCodeHash,
          opaqueToken,
          tokenHash,
        });
        return json({ ok: true, connected: true, token: exchange.token, user: exchange.user });
      } catch (err: any) {
        const message = String(err?.message ?? err);
        const code = ['access_denied', 'authorization_pending', 'expired_token'].includes(message)
          ? message
          : 'access_denied';
        return json({ ok: false, status: code }, code === 'authorization_pending' ? 200 : 400);
      }
    }
    return json({ ok: true, status: poll.status });
  }),
});

http.route({
  path: '/karen/admin/wipe-placeholders',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const authorization = authorizeIngest(request);
    if (!authorization.ok) {
      return json({ ok: false, error: authorization.error }, authorization.status);
    }
    const actor = request.headers.get('x-karen-admin-actor');
    if (!actor || actor.trim().length === 0) {
      return json({ ok: false, error: 'missing_admin_actor' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const dryRun = Boolean(body && typeof body === 'object' && (body as any).dryRun);
    const result = await ctx.runMutation(internal.karen.wipeLocalPlaceholders, { actor: actor.trim(), dryRun });
    return json({ ok: true, ...result });
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
    const actorCheck = requireAdminActor(request);
    if (!actorCheck.ok) {
      return json({ ok: false, error: actorCheck.error }, actorCheck.status);
    }

    const body = await request.json().catch(() => ({}));
    const mode = body && typeof body === 'object' && (body as any).mode === 'all' ? 'all' : 'smoke';
    const result = await ctx.runMutation(internal.karen.cleanupDevRecordsBySecret, { mode, actor: actorCheck.actor });
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
    const actorCheck = requireAdminActor(request);
    if (!actorCheck.ok) {
      return json({ ok: false, error: actorCheck.error }, actorCheck.status);
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
      actor: actorCheck.actor,
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
    const actorCheck = requireAdminActor(request);
    if (!actorCheck.ok) {
      return json({ ok: false, error: actorCheck.error }, actorCheck.status);
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
      actor: actorCheck.actor,
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
    const actorCheck = requireAdminActor(request);
    if (!actorCheck.ok) {
      return json({ ok: false, error: actorCheck.error }, actorCheck.status);
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const result = await ctx.runMutation(internal.karen.resetUserDataBySecret, {
      userId: (body as any).userId,
      mode: (body as any).mode,
      reason: (body as any).reason,
      actor: actorCheck.actor,
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
    const actorCheck = requireAdminActor(request);
    if (!actorCheck.ok) {
      return json({ ok: false, error: actorCheck.error }, actorCheck.status);
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
      actor: actorCheck.actor,
    });
    return json(result);
  }),
});

// ---------------------------------------------------------------------------
// Voice synthesis endpoint for the Vercel landing.
// Public (no auth), per-IP rate-limited, content-hash cached in Convex file
// storage. The browser calls POST with { text, voiceId?, mood?, cacheKey? }
// and gets audio/mpeg back.
// ---------------------------------------------------------------------------

const VOICE_ALLOWED_ORIGINS = (process.env.KAREN_VOICE_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsHeaders = (request: Request): Record<string, string> => {
  const origin = request.headers.get('origin') || '';
  let allow = '*';
  if (VOICE_ALLOWED_ORIGINS.length > 0) {
    allow = VOICE_ALLOWED_ORIGINS.includes(origin) ? origin : VOICE_ALLOWED_ORIGINS[0];
  }
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'vary': 'origin',
  };
};

http.route({
  path: '/karen/voice/synthesize',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  })),
});

http.route({
  path: '/karen/voice/synthesize',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'voice_not_configured', message: 'ELEVENLABS_API_KEY is not set in the Convex deployment.' }),
        { status: 503, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }

    const body = await request.json().catch(() => null) as null | {
      text?: string;
      voiceId?: string;
      mood?: string;
      cacheKey?: string;
    };
    if (!body || typeof body.text !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'invalid_body' }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }
    const rawText = body.text.trim();
    if (rawText.length === 0 || rawText.length > 280) {
      return new Response(
        JSON.stringify({ ok: false, error: 'text_length_invalid', limit: 280 }),
        { status: 400, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }

    // Per-IP rate limit. 30 requests per 5 minutes; on overflow we lock the IP
    // out for the rest of the window. Falls back to a `no-ip` bucket if the
    // edge didn't tell us where the request came from.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || request.headers.get('cf-connecting-ip')
      || request.headers.get('x-real-ip')
      || 'no-ip';
    const rl = await ctx.runMutation(internal.karen.checkVoiceRateLimit, {
      key: `voice:${ip}`,
      maxPerWindow: 30,
      windowMs: 5 * 60 * 1000,
    });
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'rate_limited', retryAfterMs: rl.retryAfterMs }),
        { status: 429, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }

    const voiceId = (typeof body.voiceId === 'string' && body.voiceId.length < 64)
      ? body.voiceId
      : (process.env.KAREN_VOICE_DEFAULT_ID || 'z9fAnlkpzviPz146aGWa');
    const mood = (typeof body.mood === 'string' && ['angry', 'standard', 'deadpan'].includes(body.mood))
      ? body.mood
      : 'standard';
    const voiceSettings = {
      // v2 (2026-05): less monotone, more expressive. See karen-voice.js for the
      // same tuning on the TUI side.
      angry:    { stability: 0.30, similarity_boost: 0.78, style: 0.80, use_speaker_boost: true, speed: 1.02 },
      standard: { stability: 0.40, similarity_boost: 0.78, style: 0.70, use_speaker_boost: true, speed: 0.90 },
      deadpan:  { stability: 0.70, similarity_boost: 0.78, style: 0.35, use_speaker_boost: true, speed: 0.85 },
    }[mood as 'angry' | 'standard' | 'deadpan'];

    // multilingual_v2 = warmer, more natural delivery. flash is faster but
     // sounds robotic. Match the TUI default in packages/karen/lib/karen-voice.js.
    const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    // Cache hash includes the full voice_settings so any future tuning auto-busts
    // the cache. Old MP3s linger in Convex file storage but stop being served.
    const contentHash = await sha256Hex(JSON.stringify({ rawText, voiceId, mood, modelId, voiceSettings }));

    // Cache hit?
    const cached = await ctx.runQuery(internal.karen.findCachedVoice, { contentHash });
    if (cached) {
      void ctx.runMutation(internal.karen.bumpVoiceHits, { contentHash });
      const blob = await ctx.storage.get(cached.storageId);
      if (blob) {
        return new Response(blob, {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
            'cache-control': 'public, max-age=2592000, immutable',
            'x-karen-voice-cache': 'hit',
            ...corsHeaders(request),
          },
        });
      }
      // Stale row pointing at a deleted blob. Fall through and regenerate.
    }

    // Cache miss → call ElevenLabs.
    let elevenResponse: Response;
    try {
      elevenResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'content-type': 'application/json',
            accept: 'audio/mpeg',
          },
          body: JSON.stringify({ text: rawText, model_id: modelId, voice_settings: voiceSettings }),
        },
      );
    } catch (err: any) {
      return new Response(
        JSON.stringify({ ok: false, error: 'elevenlabs_fetch_failed', message: String(err?.message || err) }),
        { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }
    if (!elevenResponse.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: 'elevenlabs_error', status: elevenResponse.status }),
        { status: 502, headers: { 'content-type': 'application/json', ...corsHeaders(request) } },
      );
    }

    const audioBlob = await elevenResponse.blob();
    const audioMp3 = new Blob([await audioBlob.arrayBuffer()], { type: 'audio/mpeg' });
    const storageId = await ctx.storage.store(audioMp3);
    await ctx.runMutation(internal.karen.recordVoiceCache, {
      contentHash,
      storageId,
      voiceId,
      mood,
      textPreview: rawText,
      byteSize: audioMp3.size,
    });

    return new Response(audioMp3, {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'cache-control': 'public, max-age=2592000, immutable',
        'x-karen-voice-cache': 'miss',
        ...corsHeaders(request),
      },
    });
  }),
});

export default http;
