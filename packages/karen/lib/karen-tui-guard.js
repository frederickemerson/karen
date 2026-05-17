// Karen TUI guard layer — improved wrapper UX for `karen /tui`.
//
// Vision (launch frames 3, 5, 11): when karen wraps opencode's TUI, a "karen
// guard" badge sits in the header and a PromptCourt CHECK panel pops in on the
// right side when a prompt is BLOCKED. The current implementation uses a
// node-pty wrapper (proxyOpencodeTuiIntercept in bin/karen.js) — that's a
// WRAPPER, not a real opencode plugin. We tried to find an opencode plugin
// API surface in node_modules/@opencode-ai/sdk; none is installed in this
// repo, so the proper plugin route is BLOCKED by upstream (Karen doesn't ship
// @opencode-ai/sdk as a dep).
//
// What this module gives us instead:
//   - renderGuardBadge() — a single-line header overlay (cursor-save + write +
//     restore). Idempotent. Safe to call repeatedly.
//   - renderBlockedSidebar(evaluation) — right-side ANSI panel that paints
//     over the rightmost ~38 columns instead of disrupting the main flow.
//   - updateScreenTail(buffer, chunk) — robust ring-buffer for the screen tail
//     used by classifyTuiContext; the old `tail = tail + chunk; tail.slice(-3000)`
//     approach quadratically grows then truncates, and after model-picker
//     churn the tail tends to be all ANSI escapes with no useful content. The
//     new helper appends, then keeps only the last N bytes AND also keeps the
//     last K *visible* (post-stripAnsi) lines, so prompt-context detection
//     stays useful even when the renderer churns a lot of escape sequences.
//   - DOCS in comments explaining what couldn't be done as a real plugin.
//
// All writes are gated on process.stdout.isTTY. Nothing here changes opencode's
// own rendering — we paint on top.

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  pink: '\x1b[38;5;213m',
  red: '\x1b[38;5;203m',
  amber: '\x1b[38;5;221m',
  green: '\x1b[38;5;120m',
  gray: '\x1b[38;5;245m',
  bgRed: '\x1b[48;5;203m\x1b[38;5;16m',
  bgPink: '\x1b[48;5;213m\x1b[38;5;16m',
};

const STRIP_ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(?:\x07|\x1b\\)|\x1b[@-_]/g;

export const stripAnsi = (value) => String(value).replace(STRIP_ANSI_RE, '');

// --- Header badge ------------------------------------------------------------

const BADGE_ROW = 1;
const BADGE_COL = 1;
const BADGE_TEXT = ' karen guard ';

export const formatGuardBadge = ({ active = true } = {}) => {
  if (!active) return '';
  return `${ansi.bgPink}${ansi.bold}${BADGE_TEXT}${ansi.reset}`;
};

export const renderGuardBadge = ({ active = true, stream = process.stdout } = {}) => {
  if (!stream.isTTY) return false;
  if (process.env.KAREN_TUI_BADGE === '0' || process.env.KAREN_TUI_BADGE === 'false') return false;
  const badge = formatGuardBadge({ active });
  if (!badge) return false;
  // Save cursor, jump to top-left, paint badge, restore cursor.
  stream.write(`\x1b7\x1b[${BADGE_ROW};${BADGE_COL}H${badge}\x1b8`);
  return true;
};

// --- Right-side BLOCKED sidebar ---------------------------------------------

const SIDEBAR_WIDTH = 38;
const SIDEBAR_PADDING = 1;

const padRight = (value, width) => {
  const text = String(value || '');
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
};

const wrapText = (text, width) => {
  const out = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > width) {
        if (current) out.push(current);
        current = word.length > width ? word.slice(0, width) : word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
    if (!words.length) out.push('');
  }
  return out;
};

export const formatBlockedSidebar = (evaluation, { width = SIDEBAR_WIDTH } = {}) => {
  const innerWidth = width - 2; // borders
  const score = typeof evaluation?.score === 'number' ? evaluation.score : '??';
  const verdictText = `BLOCKED ${score}/100`;
  const reasons = Array.isArray(evaluation?.reasons) ? evaluation.reasons.slice(0, 5) : [];
  const lines = [];
  lines.push(`${ansi.bgPink}${ansi.bold}${padRight(' PROMPTCOURT CHECK ', innerWidth)}${ansi.reset}`);
  lines.push(`${ansi.red}${ansi.bold}${padRight(` ${verdictText}`, innerWidth)}${ansi.reset}`);
  lines.push(`${ansi.gray}${'─'.repeat(innerWidth)}${ansi.reset}`);
  lines.push(`${ansi.amber}${padRight(' Charges:', innerWidth)}${ansi.reset}`);
  for (const reason of reasons) {
    const wrapped = wrapText(reason, innerWidth - 3);
    if (wrapped.length === 0) continue;
    lines.push(`${ansi.red} • ${ansi.reset}${ansi.gray}${padRight(wrapped[0], innerWidth - 3)}${ansi.reset}`);
    for (const cont of wrapped.slice(1)) {
      lines.push(`${ansi.gray}   ${padRight(cont, innerWidth - 3)}${ansi.reset}`);
    }
  }
  lines.push(`${ansi.gray}${'─'.repeat(innerWidth)}${ansi.reset}`);
  lines.push(`${ansi.green}${padRight(' Rewrite the prompt below.', innerWidth)}${ansi.reset}`);
  return lines;
};

// Paint the sidebar starting at top-right, using cursor-save/restore so the
// user's main flow is left alone. opencode's TUI repaints on every keystroke,
// so this overlay will get overwritten quickly — that's by design: it appears
// as a flash that's visible long enough to read, and the BLOCKED message in
// the main scrollback stays as the durable record.
export const renderBlockedSidebar = (evaluation, { stream = process.stdout, width = SIDEBAR_WIDTH } = {}) => {
  if (!stream.isTTY) return false;
  if (process.env.KAREN_TUI_SIDEBAR === '0' || process.env.KAREN_TUI_SIDEBAR === 'false') return false;
  const columns = stream.columns || 120;
  if (columns < width + 8) return false; // not enough room
  const startCol = Math.max(1, columns - width + 1);
  const lines = formatBlockedSidebar(evaluation, { width });
  let out = '\x1b7'; // save cursor
  lines.forEach((rendered, idx) => {
    const row = 2 + idx + SIDEBAR_PADDING; // leave row 1 for badge
    out += `\x1b[${row};${startCol}H${rendered}`;
  });
  out += '\x1b8'; // restore cursor
  stream.write(out);
  return true;
};

// --- Screen-tail ring buffer -------------------------------------------------
//
// classifyTuiContext in bin/karen.js inspects the last few visible lines of
// the screen to decide whether a typed buffer looks like a prompt or a
// picker/confirmation. The old approach (`screenTail = (screenTail + chunk).slice(-3000)`)
// has two bugs:
//   1. After the model picker churns thousands of ANSI escapes, the last 3000
//      bytes are dominated by escape codes; the visible-line classifier gets
//      starved.
//   2. String concat + slice is O(n) per chunk; over a long session this adds
//      up.
// updateScreenTail keeps a small structured ring of recent visible lines.

const DEFAULT_TAIL_BYTES = 3000;
const DEFAULT_TAIL_LINES = 16;

export const createScreenTailBuffer = ({ maxBytes = DEFAULT_TAIL_BYTES, maxLines = DEFAULT_TAIL_LINES } = {}) => ({
  raw: '',
  maxBytes,
  maxLines,
  visibleLines: [],
});

export const updateScreenTail = (buffer, chunk) => {
  if (!buffer || typeof chunk !== 'string') return buffer;
  // Append raw, then truncate to maxBytes from the right.
  const merged = buffer.raw + chunk;
  buffer.raw = merged.length > buffer.maxBytes ? merged.slice(-buffer.maxBytes) : merged;
  // Maintain visible-line ring.
  const visibleChunk = stripAnsi(chunk);
  if (visibleChunk.length === 0) return buffer;
  const linesFromChunk = visibleChunk.split(/\r?\n/);
  if (buffer.visibleLines.length === 0) {
    buffer.visibleLines = linesFromChunk;
  } else {
    // Append: the first chunk line continues the last existing line.
    const last = buffer.visibleLines.pop() || '';
    buffer.visibleLines.push(last + linesFromChunk[0]);
    for (let i = 1; i < linesFromChunk.length; i += 1) {
      buffer.visibleLines.push(linesFromChunk[i]);
    }
  }
  // Drop blanks at the edges sparingly; keep up to maxLines non-trivial lines.
  if (buffer.visibleLines.length > buffer.maxLines * 4) {
    buffer.visibleLines = buffer.visibleLines.slice(-buffer.maxLines * 2);
  }
  return buffer;
};

export const screenTailVisible = (buffer, lineCount = 8) => {
  if (!buffer) return '';
  const nonBlank = buffer.visibleLines.filter((entry) => entry && entry.trim()).slice(-lineCount);
  return nonBlank.join('\n');
};

export const screenTailRaw = (buffer) => buffer?.raw || '';

// --- Real-plugin investigation report ---------------------------------------
//
// We checked node_modules for `@opencode-ai/sdk` and similar packages:
//   * Not installed under packages/karen/node_modules.
//   * Not installed under the repo root node_modules either.
//   * packages/karen/package.json declares no opencode plugin dependency;
//     only `node-pty` and `typescript`.
//
// The existing packages/karen/lib/opencode-hook.js already abstracts this
// situation: `detectOpenCodeHookSupport({ upstream })` checks an `upstream`
// object for a `registerPromptHook` / `hooks.prompt.submit` shape. With no
// upstream SDK available, `selectOpenCodeInterceptionStrategy` falls back to
// PTY_STRATEGY (the wrapper we improve here).
//
// opencode itself supports configuration via OPENCODE_CONFIG + opencode.json's
// `plugin` field (an array of module specifiers), but the opencode binary
// loads plugins inside its own runtime and there is no documented stable JS
// API surface for "intercept the prompt before send" from outside that
// runtime. Until upstream opencode exposes a plugin SDK that we can require()
// from this package and pass to detectOpenCodeHookSupport, the wrapper is
// the only available path.
//
// See CHANGES.md for the full investigation.

export const openCodePluginAvailability = ({ env = process.env } = {}) => ({
  sdkInstalled: false, // determined at runtime in karen.js if needed
  reason: 'No @opencode-ai/sdk in node_modules; opencode does not expose a documented external plugin entrypoint that Karen can register against. PTY wrapper remains the supported path.',
  configFile: env.OPENCODE_CONFIG || null,
});

export const __karenTuiGuardTest = {
  formatGuardBadge,
  formatBlockedSidebar,
  createScreenTailBuffer,
  updateScreenTail,
  screenTailVisible,
  screenTailRaw,
  wrapText,
  stripAnsi,
  openCodePluginAvailability,
};
