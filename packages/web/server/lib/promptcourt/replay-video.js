import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REPLAY_VIDEO_SCHEMA_VERSION = 'karen.replay-video.v1';
export const REPLAY_COMPOSITION_ID = 'KarenReplay';

export const REMOTION_INSTALL_HINT = 'Video export requires Remotion to be installed. Run: bun add remotion @remotion/cli @remotion/bundler @remotion/renderer';

export class RemotionNotInstalledError extends Error {
  constructor(message = REMOTION_INSTALL_HINT, { cause } = {}) {
    super(message);
    this.name = 'RemotionNotInstalledError';
    this.code = 'REMOTION_NOT_INSTALLED';
    this.statusCode = 503;
    if (cause !== undefined) this.cause = cause;
  }
}

const isModuleNotFoundError = (error) => {
  if (!error) return false;
  if (error.code === 'MODULE_NOT_FOUND' || error.code === 'ERR_MODULE_NOT_FOUND') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Cannot find (module|package)|module not found/i.test(message);
};

const KNOWN_FORMATS = new Set(['json', 'mp4']);
const KNOWN_STATUSES = new Set(['complete', 'active', 'pending', 'failed']);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const cleanText = (value, fallback = '') => {
  const text = typeof value === 'string' ? value : fallback;
  return text.replace(/\s+/g, ' ').trim().slice(0, 800);
};

const normalizeFormat = (value) => {
  const format = cleanText(value || 'mp4').toLowerCase();
  return KNOWN_FORMATS.has(format) ? format : 'mp4';
};

const normalizeOutcome = (value, events = []) => {
  if (value === 'deleted' || value === 'promoted') return value;
  const statuses = events.map((event) => cleanText(event?.status).toLowerCase());
  if (statuses.some((status) => status === 'rollback' || status === 'failed' || status.includes('failed'))) {
    return 'deleted';
  }
  return 'promoted';
};

const normalizeStepStatus = (value, index, total) => {
  const status = cleanText(value).toLowerCase();
  if (KNOWN_STATUSES.has(status)) return status;
  return index >= total - 1 ? 'active' : 'complete';
};

const timestampForIndex = (index) => {
  const seconds = index * 14;
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const rest = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
};

const slugify = (value, fallback = 'karen-replay') => {
  const slug = cleanText(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
  return slug || fallback;
};

export const buildReplayStepsFromEvents = (events = []) => {
  const sorted = Array.isArray(events)
    ? events.slice().sort((left, right) => Number(left?.createdAt || 0) - Number(right?.createdAt || 0))
    : [];

  return sorted.slice(0, 12).map((event, index) => {
    const status = cleanText(event?.status).toLowerCase();
    const failed = status === 'rollback' || status === 'failed' || status.includes('failed') || status.includes('blocked');
    const final = index === sorted.length - 1;
    return {
      id: cleanText(event?.id, `event-${index + 1}`),
      label: cleanText(event?.label, status || `Run event ${index + 1}`),
      description: cleanText(event?.details, 'Karen recorded this run event.'),
      detail: cleanText(event?.details, status || 'No additional event detail.'),
      timestamp: timestampForIndex(index),
      status: failed ? 'failed' : final ? 'active' : 'complete',
      metric: status || undefined,
    };
  });
};

export const normalizeReplaySteps = (steps = [], events = [], outcome = 'promoted') => {
  const rawSteps = Array.isArray(steps) && steps.length > 0 ? steps : buildReplayStepsFromEvents(events);
  const fallbackSteps = rawSteps.length > 0 ? rawSteps : [
    {
      id: 'prompt-submitted',
      label: 'Prompt submitted',
      description: 'Karen received a guarded run request.',
      detail: 'Replay data was generated from the export request.',
      timestamp: '00:00',
      status: 'complete',
      metric: 'queued',
    },
    {
      id: outcome === 'deleted' ? 'patch-deleted' : 'patch-promoted',
      label: outcome === 'deleted' ? 'Patch deleted' : 'Patch promoted',
      description: outcome === 'deleted'
        ? 'The generated work was rolled back after the quiz.'
        : 'The generated work survived the quiz and can be promoted.',
      detail: 'This fallback step keeps the Remotion contract renderable even when live run events are missing.',
      timestamp: '00:14',
      status: outcome === 'deleted' ? 'failed' : 'active',
      metric: outcome,
    },
  ];

  return fallbackSteps.slice(0, 16).map((step, index, list) => ({
    id: slugify(step?.id || step?.label || `step-${index + 1}`, `step-${index + 1}`),
    label: cleanText(step?.label, `Step ${index + 1}`),
    description: cleanText(step?.description, 'Karen replay step.'),
    detail: cleanText(step?.detail, step?.description || 'No detail recorded.'),
    timestamp: cleanText(step?.timestamp, timestampForIndex(index)).slice(0, 12),
    status: normalizeStepStatus(step?.status, index, list.length),
    metric: step?.metric ? cleanText(step.metric).slice(0, 64) : undefined,
    startFrame: index * 72,
    durationFrames: 66,
  }));
};

export const buildReplayVideoContract = ({
  title = 'Karen Replay Tape',
  subtitle = 'Prompt to patch fate, rendered as proof the code was read.',
  outcome,
  steps = [],
  events = [],
  session = null,
  username = null,
  createdAt = Date.now(),
  width = 1920,
  height = 1080,
  fps = 30,
} = {}) => {
  const normalizedOutcome = normalizeOutcome(outcome, events);
  const normalizedSteps = normalizeReplaySteps(steps, events, normalizedOutcome);
  const safeWidth = clamp(Number(width) || 1920, 640, 3840);
  const safeHeight = clamp(Number(height) || 1080, 360, 2160);
  const safeFps = clamp(Number(fps) || 30, 24, 60);
  const durationInFrames = Math.max(180, normalizedSteps.at(-1).startFrame + 96);
  const sessionId = cleanText(session?.id || session?.sessionId || session?.opencodeSessionId || events?.[0]?.sessionId || 'ad-hoc');

  return {
    schemaVersion: REPLAY_VIDEO_SCHEMA_VERSION,
    compositionId: REPLAY_COMPOSITION_ID,
    renderTarget: {
      width: safeWidth,
      height: safeHeight,
      fps: safeFps,
      durationInFrames,
    },
    metadata: {
      replayId: `replay_${slugify(sessionId)}_${createdAt}`,
      sessionId,
      username: cleanText(username || session?.username || events?.[0]?.username || 'local-user'),
      outcome: normalizedOutcome,
      createdAt,
      title: cleanText(title, 'Karen Replay Tape'),
      subtitle: cleanText(subtitle, 'Prompt to patch fate, rendered as proof the code was read.'),
    },
    props: {
      title: cleanText(title, 'Karen Replay Tape'),
      subtitle: cleanText(subtitle, 'Prompt to patch fate, rendered as proof the code was read.'),
      outcome: normalizedOutcome,
      steps: normalizedSteps,
      theme: {
        background: '#0b0b0c',
        foreground: '#f8f5ed',
        accent: '#f4c542',
        danger: '#ff5a5f',
        success: '#45d483',
      },
    },
  };
};

export const createStubReplayRenderer = ({
  outputDir = path.join(os.tmpdir(), 'karen-replay-exports'),
  now = Date.now,
} = {}) => ({
  name: 'stub-json-renderer',
  async render(contract, { format = 'mp4' } = {}) {
    const normalizedFormat = normalizeFormat(format);
    fs.mkdirSync(outputDir, { recursive: true });
    const filename = `${contract.metadata.replayId}.${normalizedFormat === 'json' ? 'json' : 'mp4.json'}`;
    const outputPath = path.join(outputDir, filename);
    const payload = {
      rendered: normalizedFormat === 'json',
      fallback: normalizedFormat === 'mp4',
      renderer: 'stub',
      generatedAt: now(),
      note: normalizedFormat === 'mp4'
        ? 'MP4 rendering is not installed. This file is the Remotion-ready render manifest.'
        : 'Replay contract export.',
      remotionPlugIn: {
        package: '@remotion/renderer',
        function: 'renderMedia',
        compositionId: contract.compositionId,
        inputProps: contract.props,
      },
      contract,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    return {
      ok: true,
      format: normalizedFormat,
      rendered: payload.rendered,
      fallback: payload.fallback,
      renderer: this.name,
      artifact: {
        filename,
        path: outputPath,
        mimeType: 'application/json',
        bytes: fs.statSync(outputPath).size,
      },
      contract,
    };
  },
});

export const createRemotionReplayRenderer = ({
  outputDir = path.join(os.tmpdir(), 'karen-replay-exports'),
} = {}) => ({
  name: 'remotion-render-media',
  async render(contract, { format = 'mp4' } = {}) {
    const normalizedFormat = normalizeFormat(format);
    if (normalizedFormat === 'json') {
      return createStubReplayRenderer({ outputDir }).render(contract, { format: 'json' });
    }

    let renderer;
    try {
      renderer = await import('@remotion/renderer');
    } catch (error) {
      if (isModuleNotFoundError(error)) {
        throw new RemotionNotInstalledError(REMOTION_INSTALL_HINT, { cause: error });
      }
      throw error;
    }

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${contract.metadata.replayId}.mp4`);

    // Remotion hook point:
    // renderer.renderMedia({
    //   composition,
    //   serveUrl,
    //   codec: 'h264',
    //   outputLocation: outputPath,
    //   inputProps: contract.props,
    // });
    // The repo does not yet ship a bundled Remotion composition/serveUrl, so keep
    // this explicit instead of pretending the MP4 exists.
    void renderer;
    throw new Error(`Remotion renderMedia hook is ready, but no Karen Remotion bundle is configured for ${outputPath}`);
  },
});

export const createReplayVideoRenderer = (options = {}) => {
  if (process.env.KAREN_REPLAY_RENDERER === 'remotion') {
    return createRemotionReplayRenderer(options);
  }
  return createStubReplayRenderer(options);
};

export const renderReplayVideoExport = async ({
  renderer,
  outputDir,
  format = 'mp4',
  ...contractInput
} = {}) => {
  const contract = buildReplayVideoContract(contractInput);
  const activeRenderer = renderer ?? createReplayVideoRenderer({ outputDir });
  return activeRenderer.render(contract, { format: normalizeFormat(format) });
};
