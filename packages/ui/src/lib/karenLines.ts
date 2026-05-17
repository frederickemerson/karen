// Karen line pools for the GUI. Mirrors packages/karen/lib/karen-voice.js
// — same idea: a deep pool of reaction templates so Karen does not sound
// like she is reading the same error string every time. Pick randomly,
// substitute {name}/{score}/{firstReason} where present.

type LineCtx = {
  name?: string;
  score?: number | string;
  firstReason?: string;
  streak?: number;
};

type Line = {
  template: string;
  when?: (ctx: LineCtx) => boolean;
};

const render = (template: string, ctx: LineCtx): string =>
  template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = (ctx as Record<string, unknown>)[key];
    return value === undefined || value === null ? '' : String(value);
  });

const pick = (lines: Line[], ctx: LineCtx): string => {
  const eligible = lines.filter((line) => !line.when || line.when(ctx));
  if (!eligible.length) return '';
  const choice = eligible[Math.floor(Math.random() * eligible.length)];
  return render(choice.template, ctx);
};

// 20+ blocked-post templates. The score is woven in occasionally, but most
// lines just react. The first charge is only mentioned in a few, never both.
const BLOCKED_POST_LINES: Line[] = [
  { template: 'Karen is filing this one under disappointment.' },
  { template: 'Absolutely not. Rewrite it with files, constraints, and tests.' },
  { template: '{score} out of one hundred. Karen has notes.' },
  { template: 'Karen is unimpressed.' },
  { template: 'No. Try again with receipts.' },
  { template: 'This prompt is going on the wall.' },
  { template: 'Karen read this, then poured a second coffee.' },
  { template: 'The cardigan came off, {name}. Bad sign.' },
  { template: 'Karen is writing your name on a sticky note.' },
  { template: '{score} out of one hundred. Karen is unimpressed.' },
  { template: 'Try again. With words this time.' },
  { template: 'This prompt is an embarrassment. Start over.', when: (ctx) => Number(ctx.score) < 30 },
  { template: 'Karen has seen worse. Not by much.', when: (ctx) => Number(ctx.score) < 30 },
  { template: 'Bold of you to send that, {name}.', when: (ctx) => Number(ctx.score) < 40 },
  { template: 'Karen is filing a complaint with the manager.' },
  { template: 'This is not a prompt. This is a wish.', when: (ctx) => Number(ctx.score) < 50 },
  { template: '{firstReason}. Karen will say it once.', when: (ctx) => Boolean(ctx.firstReason) },
  { template: 'Karen could have written that for you. She will not.' },
  { template: 'You know what was missing? Specifics. All of them.' },
  { template: '{name}, three strikes. Karen has notes.' },
  { template: 'Karen tried to read this. Karen failed.' },
  { template: 'Karen is reading your last commit. Not impressed.' },
  { template: 'Submit anything that vague again and Karen takes the cookies.' },
];

const QUIZ_FAILED_LINES: Line[] = [
  { template: 'Quiz failed. Sandbox deleted. Read the code before you defend it.' },
  { template: 'Not even close. The diff was right there, {name}.' },
  { template: 'You did not read the code, {name}.' },
  { template: 'Karen vs {name}. Final score: zero.' },
  { template: 'Thrown out. Every line, next time.' },
  { template: 'Karen graded this. F minus.' },
  { template: '{score} out of one hundred. Karen is filing it.' },
  { template: 'The patch died here. Karen is not surprised.' },
  { template: 'Karen warned you, {name}.' },
  { template: 'Failed the quiz. Karen is filing it under "told you so".' },
];

const PROFILE_LINES: Line[] = [
  { template: '{name}. {score} out of one hundred. Karen has notes.', when: (ctx) => Number(ctx.score) < 50 },
  { template: '{name}. Karen is unimpressed.', when: (ctx) => Number(ctx.score) < 30 },
  { template: '{name}. The cardigan came off, {name}. Bad sign.', when: (ctx) => Number(ctx.score) < 30 },
  { template: '{name}. {score} out of one hundred. Acceptable, for now.', when: (ctx) => Number(ctx.score) >= 50 && Number(ctx.score) < 80 },
  { template: '{name}. Acceptable work. Karen will not say it twice.', when: (ctx) => Number(ctx.score) >= 50 && Number(ctx.score) < 80 },
  { template: '{name}. {score} out of one hundred. Karen is reluctantly proud.', when: (ctx) => Number(ctx.score) >= 80 },
  { template: '{name}. Karen is reluctantly proud. Do not get comfortable.', when: (ctx) => Number(ctx.score) >= 80 },
  { template: '{name}. Karen will withhold cookies, but not approval.', when: (ctx) => Number(ctx.score) >= 80 },
];

export const pickBlockedPostLine = (ctx: LineCtx): string => pick(BLOCKED_POST_LINES, ctx);
export const pickQuizFailedLine = (ctx: LineCtx): string => pick(QUIZ_FAILED_LINES, ctx);
export const pickProfileLine = (ctx: LineCtx): string => pick(PROFILE_LINES, ctx);
