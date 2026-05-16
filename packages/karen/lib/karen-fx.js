// Karen personality FX — pure render helpers gated by KAREN_FX env + TTY.
//
// Every function in this module respects:
//   - process.stdout.isTTY (no-op on pipes)
//   - process.env.KAREN_FX !== '0' (kill switch)
// On Windows cmd.exe (NOT Windows Terminal) we degrade to plain ASCII.
//
// Side effects are limited to process.stdout writes and setTimeout for line-by-line paints.

const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[38;5;203m',
  green: '\x1b[38;5;120m',
  cyan: '\x1b[38;5;81m',
  amber: '\x1b[38;5;221m',
  pink: '\x1b[38;5;213m',
  gray: '\x1b[38;5;245m',
  bgRed: '\x1b[48;5;203m\x1b[38;5;16m',
  bgGreen: '\x1b[48;5;120m\x1b[38;5;16m',
  bgYellow: '\x1b[48;5;221m\x1b[38;5;16m',
  bgPink: '\x1b[48;5;213m\x1b[38;5;16m',
};

const isWindowsCmd = () => process.platform === 'win32' && !process.env.WT_SESSION;
const fxEnabled = () => process.stdout.isTTY && process.env.KAREN_FX !== '0';
const color = (value, tone) => process.stdout.isTTY ? `${ansi[tone] || ''}${value}${ansi.reset}` : value;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeLine = (value = '') => process.stdout.write(`${value}\n`);

// --- Faces -----------------------------------------------------------------

export const karenFaces = {
  neutral: [
    '  ░░████░░ ',
    '  ░█░░░░█░ ',
    '  █░●░░●░█ ',
    '  █░░▔▔░░█ ',
    '  ░█▄▄▄▄█░ ',
  ],
  squint: [
    '  ░░████░░ ',
    '  ░█░░░░█░ ',
    '  █░-░░-░█ ',
    '  █░░▔▔░░█ ',
    '  ░█▄▄▄▄█░ ',
  ],
  furious: [
    '  ░░████░░ ',
    '  ░█>░░<█░ ',
    '  █░◣░░◢░█ ',
    '  █░░▿▿░░█ ',
    '  ░█▄▄▄▄█░ ',
  ],
  smug: [
    '  ░░████░░ ',
    '  ░█░░░░█░ ',
    '  █░◠░░◠░█ ',
    '  █░░◡◡░░█ ',
    '  ░█▄▄▄▄█░ ',
  ],
  asleep: [
    '  ░░████░░ ',
    '  ░█░░░░█░ ',
    '  █░-z-z-█ ',
    '  █░░__░░█ ',
    '  ░█▄▄▄▄█░ ',
  ],
};

// pickFace({ score, idle, verdict }) → name of the face to render.
// Pure: no I/O, exported for tests.
export const pickFace = ({ score = null, idle = false, verdict = null } = {}) => {
  if (idle) return 'asleep';
  if (verdict === 'blocked') return 'furious';
  if (verdict === 'passed') return 'smug';
  if (typeof score === 'number') {
    if (score < 40) return 'furious';
    if (score < 70) return 'squint';
    if (score >= 90) return 'smug';
  }
  return 'neutral';
};

export const renderFace = (faceName = 'neutral') => karenFaces[faceName] || karenFaces.neutral;

// --- Verdict stamp ---------------------------------------------------------

export const printVerdictStamp = async (verdict) => {
  if (!fxEnabled()) return;
  const passed = String(verdict).toLowerCase() === 'passed' || String(verdict).toLowerCase() === 'approved';
  const label = passed ? '  APPROVED  ' : '  BLOCKED  ';
  const tone = passed ? 'bgGreen' : 'bgRed';
  const filler = '═'.repeat(label.length);
  writeLine('');
  writeLine(color(filler, passed ? 'green' : 'red'));
  for (let i = 0; i < 3; i += 1) {
    process.stdout.write(`\r${color(label, tone)}`);
    await sleep(60);
    process.stdout.write(`\r${' '.repeat(label.length)}`);
    await sleep(40);
  }
  process.stdout.write(`\r${color(label, tone)}\n`);
  writeLine(color(filler, passed ? 'green' : 'red'));
};

// --- Time-of-day moods -----------------------------------------------------

export const KAREN_MOODS = {
  morning: [
    'Karen is awake. Are you?',
    'Karen made coffee. She drank it. She is mad now.',
  ],
  afternoon: [
    'Karen has notes from the morning. She will share them.',
    'Karen has been waiting for a good prompt all day.',
  ],
  evening: [
    'Karen turned the porch light on. Keep your prompts short.',
    'Karen will be done in five minutes if you do not waste hers.',
  ],
  late: [
    'Karen is in her robe. Do not write a 2000-word prompt right now.',
    'Karen has slippers on. She still has opinions.',
  ],
  postLoss: [
    'Karen remembers your last streak. So does the feed.',
    'Karen wrote down what happened. Try better today.',
  ],
};

const moodBucket = (date = new Date()) => {
  const h = date.getHours();
  if (h < 11) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 22) return 'evening';
  return 'late';
};

export const pickStartupMood = ({ postLossStreak = false, now = new Date() } = {}) => {
  const bucket = postLossStreak ? 'postLoss' : moodBucket(now);
  const choices = KAREN_MOODS[bucket] || KAREN_MOODS.afternoon;
  return choices[Math.floor(Math.random() * choices.length)];
};

export const printStartupMood = (opts) => {
  if (!fxEnabled()) return;
  const mood = pickStartupMood(opts);
  writeLine(color(mood, 'amber'));
};

// --- Streak fire bar -------------------------------------------------------

export const renderStreakBar = (streak = 0) => {
  if (!streak || streak < 1) return '';
  if (isWindowsCmd()) {
    const stars = '*'.repeat(Math.min(10, streak));
    return streak >= 7 ? `STREAK ${stars} (${streak})` : `streak ${stars} (${streak})`;
  }
  const glyphs = '🔥'.repeat(Math.min(10, streak));
  return streak >= 7 ? `STREAK ${glyphs} (${streak})` : `streak ${glyphs} (${streak})`;
};

export const printStreakBar = (streak = 0) => {
  if (!fxEnabled() || streak < 1) return;
  const bar = renderStreakBar(streak);
  writeLine(color(bar, streak >= 7 ? 'amber' : 'gray'));
};

// --- POSTED TO @user shame stamp ------------------------------------------

export const printShameStamp = ({ username, postId, host = 'karen.court' } = {}) => {
  if (!fxEnabled() || !username) return;
  const u = String(username).replace(/^@/, '');
  const safeId = String(postId || 'unknown').slice(0, 12);
  const link = `${host}/u/${u}/p/${safeId}`;
  const inner = ` POSTED TO @${u} `;
  const linkLine = ` ${link} `;
  const width = Math.max(inner.length, linkLine.length);
  const padInner = inner.padEnd(width, ' ');
  const padLink = linkLine.padEnd(width, ' ');
  const border = '─'.repeat(width);
  writeLine('');
  writeLine(color(`┌${border}┐`, 'red'));
  writeLine(color(`│${padInner}│`, 'red'));
  writeLine(color(`│${padLink}│`, 'red'));
  writeLine(color(`└${border}┘`, 'red'));
};

// --- Quiz drumroll ---------------------------------------------------------

export const drumrollReveal = async (label = 'NEXT QUESTION') => {
  if (!fxEnabled()) return;
  for (const dots of ['.', '..', '...']) {
    process.stdout.write(`\r${color(`${label} ${dots}`, 'amber')}   `);
    await sleep(120);
  }
  process.stdout.write(`\r${' '.repeat(label.length + 8)}\r`);
};

// --- Big ASCII paint -------------------------------------------------------

const PASSED_ART = [
  '██████   █████  ███████ ███████ ███████ ██████',
  '██   ██ ██   ██ ██      ██      ██      ██   ██',
  '██████  ███████ ███████ ███████ █████   ██   ██',
  '██      ██   ██      ██      ██ ██      ██   ██',
  '██      ██   ██ ███████ ███████ ███████ ██████',
];

const THROWN_OUT_ART = [
  '████████ ██   ██ ██████   ██████  ██     ██ ███    ██',
  '   ██    ██   ██ ██   ██ ██    ██ ██     ██ ████   ██',
  '   ██    ███████ ██████  ██    ██ ██  █  ██ ██ ██  ██',
  '   ██    ██   ██ ██   ██ ██    ██ ██ ███ ██ ██  ██ ██',
  '   ██    ██   ██ ██   ██  ██████   ███ ███  ██   ████',
  '',
  '             O U T',
];

export const paintBigText = async (kind = 'passed') => {
  if (!fxEnabled()) return;
  const tone = kind === 'passed' ? 'green' : 'red';
  const art = kind === 'passed' ? PASSED_ART : THROWN_OUT_ART;
  writeLine('');
  for (const row of art) {
    writeLine(color(row, tone));
    // eslint-disable-next-line no-await-in-loop
    await sleep(38);
  }
  writeLine('');
};

// --- Profile barbs ---------------------------------------------------------

export const profileBarb = ({ disciplineScore = 50, publicFailureCount = 0, currentStreak = 0 } = {}) => {
  if (currentStreak >= 7) return 'Karen is impressed. She will deny it.';
  if (currentStreak >= 3) return 'Karen has cautious optimism. Do not ruin it.';
  if (publicFailureCount >= 10) return 'Karen knows your name from the feed. It is not flattering.';
  if (publicFailureCount >= 3) return 'Karen has a folder with your name on it.';
  if (disciplineScore < 30) return 'Karen is concerned. About you.';
  if (disciplineScore < 60) return 'Karen has expectations. Lower than yours.';
  if (disciplineScore >= 90) return 'Karen recognizes professional behavior. Do not get cocky.';
  return 'Karen is watching.';
};

export const printProfileBarb = (stats) => {
  if (!fxEnabled()) return;
  writeLine(color(profileBarb(stats), 'gray'));
};

// --- Idle heckle -----------------------------------------------------------

export const IDLE_HECKLES = [
  'Karen: still waiting.',
  'Karen: did you forget you opened this?',
  'Karen: write something or close the tab.',
  'Karen: the cursor is blinking. So is she.',
  'Karen: type. Anything. With acceptance criteria.',
];

export const pickIdleHeckle = () => IDLE_HECKLES[Math.floor(Math.random() * IDLE_HECKLES.length)];

export const printIdleHeckle = () => {
  if (!fxEnabled()) return;
  writeLine('');
  writeLine(color(pickIdleHeckle(), 'amber'));
};

// --- Streak tombstone ------------------------------------------------------

export const printStreakTombstone = (streak = 0) => {
  if (!fxEnabled() || streak < 3) return;
  const lines = [
    '       _______',
    '      /       \\',
    '     |  R.I.P  |',
    `     | streak  |`,
    `     |   ${String(streak).padStart(3, ' ')}   |`,
    '     |_________|',
  ];
  writeLine('');
  for (const ln of lines) writeLine(color(ln, 'gray'));
  writeLine(color('  A moment of silence for what was.', 'gray'));
  writeLine('');
};

// --- Goodbye lines ---------------------------------------------------------

export const GOODBYE_LINES = {
  default: ['Karen dismissed.'],
  win: ['Karen approves. Do not get used to it.', 'Karen logs off smug.'],
  loss: ['Karen is taking notes for next time.', 'Karen will remember this.'],
  idle: ['Karen left. You did nothing.', 'Karen got bored and left.'],
};

export const pickGoodbye = (outcome = 'default') => {
  const pool = GOODBYE_LINES[outcome] || GOODBYE_LINES.default;
  return pool[Math.floor(Math.random() * pool.length)];
};

export const printGoodbye = (outcome = 'default') => {
  const text = pickGoodbye(outcome);
  if (process.stdout.isTTY) writeLine(color(text, 'gray'));
  else writeLine(text);
};

// --- Easter eggs -----------------------------------------------------------

export const sorryReply = () => 'Karen accepts the apology. Conditionally.';
export const pleaseReply = () => 'Karen says please does not unblock a 50/100 prompt. Better acceptance criteria do.';

export const karenHaiku = () => [
  'Bad prompt walks in late.',
  'Karen sharpens her pencil.',
  'Sandbox now deleted.',
].join('\n');

export const __karenFxTest = {
  pickFace,
  pickStartupMood,
  renderStreakBar,
  profileBarb,
  pickIdleHeckle,
  pickGoodbye,
  IDLE_HECKLES,
  KAREN_MOODS,
  GOODBYE_LINES,
  karenFaces,
  isWindowsCmd,
  fxEnabled,
};
