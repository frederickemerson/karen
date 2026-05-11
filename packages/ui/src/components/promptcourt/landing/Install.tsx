import React from 'react';
import {
  RiCheckLine,
  RiClipboardLine,
  RiGithubFill,
  RiTerminalBoxLine,
} from '@remixicon/react';

const REPO_URL = 'https://github.com/frederickemerson/karen';
const ISSUES_URL = 'https://github.com/frederickemerson/karen/issues';

const ONE_LINE_INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh';

const prerequisites = [
  ['git', 'any recent version'],
  ['node', '20 or newer'],
  ['bun', 'auto-installed if missing'],
  ['opencode', 'CLI used for prompt verdicts'],
] as const;

const dailyCommands = [
  ['Open shell', 'karen', 'Start an interactive Karen session in the current repo.'],
  ['Guard TUI', '/tui', 'Watch prompts, verdicts, and sandbox runs as they happen.'],
  ['Open GUI', '/gui', 'Launch the browser dashboard for diff quizzes and the scoreboard.'],
  ['Help', 'karen --help', 'List every subcommand and flag.'],
] as const;

const envOverrides = [
  ['KAREN_REPO_URL', 'https://github.com/frederickemerson/karen.git', 'Git repo to clone from. Point at a fork to install your own build.'],
  ['KAREN_BRANCH', 'main', 'Branch to track. Useful for testing release candidates.'],
  ['KAREN_HOME', '$HOME/.karen', 'Where the Karen source is cloned and updated.'],
  ['KAREN_INSTALL_DIR', '$HOME/.local/bin', 'Where the `karen` launcher script is written.'],
  ['KAREN_SKIP_BUN', 'unset', 'Set to 1 to fail rather than auto-install Bun.'],
] as const;

const useCopyToClipboard = (text: string) => {
  const [copied, setCopied] = React.useState(false);
  const copy = React.useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {
        // best-effort — ignore failures (e.g. insecure context)
      });
  }, [text]);
  return { copied, copy };
};

const CopyButton: React.FC<{ value: string; label?: string }> = ({ value, label = 'Copy' }) => {
  const { copied, copy } = useCopyToClipboard(value);
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className="inline-flex items-center gap-1.5 rounded-sm border border-[#7bd88f]/30 bg-transparent px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-[#7bd88f] transition hover:border-[#7bd88f] hover:bg-[#7bd88f]/10"
    >
      {copied ? <RiCheckLine className="size-3.5" /> : <RiClipboardLine className="size-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
};

const StepNumber: React.FC<{ n: number }> = ({ n }) => (
  <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-[#111] bg-[#f6f2e8] font-mono text-sm font-semibold shadow-[3px_3px_0_#111]">
    {n.toString().padStart(2, '0')}
  </div>
);

export const Install: React.FC = () => (
  <div className="mx-auto grid max-w-7xl gap-16 px-4 py-12 sm:px-6 lg:px-8">
    {/* HERO */}
    <section className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          install · ~30 seconds
        </div>
        <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
          One line. Then Karen judges every patch.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-[#4d4d4d]">
          Karen runs local-first. Prompt verdicts, sandbox runs, and diff quiz checks all start from your machine — no daemon, no background service.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-[#111] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#111] hover:text-[#f6f2e8]"
          >
            <RiGithubFill className="size-4" />
            View source
          </a>
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-sm border border-[#111] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#111] hover:text-[#f6f2e8]"
          >
            Report an issue
          </a>
        </div>
      </div>

      <div className="rounded-md border border-[#111] bg-[#111] p-5 font-mono text-sm text-[#f6f2e8] shadow-[10px_10px_0_#111]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[#6f6f6f]">
            <RiTerminalBoxLine className="size-4" />
            <span className="text-xs uppercase tracking-[0.16em]">paste in a terminal</span>
          </div>
          <CopyButton value={ONE_LINE_INSTALL_CMD} />
        </div>
        <div className="mt-4 break-all leading-7 text-[#7bd88f]">
          <span className="select-none text-[#555]">$ </span>
          {ONE_LINE_INSTALL_CMD}
        </div>
        <div className="mt-3 leading-7 text-[#7bd88f]">
          <span className="select-none text-[#555]">$ </span>karen
        </div>
        <div className="mt-4 border-t border-[#222] pt-3 text-xs text-[#8a8a8a]">
          macOS · Linux · WSL · works without sudo.
        </div>
      </div>
    </section>

    {/* STEPS */}
    <section>
      <div className="mb-6 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
        what happens
      </div>
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: 'Check prerequisites',
            body: 'Verifies git and Node 20+ are on PATH. Falls back with a clear error if not.',
          },
          {
            title: 'Install Bun',
            body: 'If Bun is missing, the official installer runs. Skip with KAREN_SKIP_BUN=1.',
          },
          {
            title: 'Clone & install',
            body: 'Shallow-clones Karen into ~/.karen and runs `bun install` for dependencies.',
          },
          {
            title: 'Write launcher',
            body: 'Drops a `karen` script into ~/.local/bin. Prints PATH advice if it is not on PATH.',
          },
        ].map((step, i) => (
          <li
            key={step.title}
            className="rounded-md border border-[#d8d8d8] bg-white p-5 shadow-[4px_4px_0_#111]"
          >
            <StepNumber n={i + 1} />
            <div className="mt-4 text-base font-semibold">{step.title}</div>
            <p className="mt-2 text-sm leading-6 text-[#4d4d4d]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>

    {/* PREREQS + DAILY COMMANDS */}
    <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
      <div>
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          prerequisites
        </div>
        <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">
          What Karen needs on your box.
        </h2>
        <p className="mt-3 text-base leading-7 text-[#4d4d4d]">
          The installer checks each of these before doing anything destructive. If something is missing it bails with the install command for that tool.
        </p>
        <ul className="mt-6 divide-y divide-[#e2ddd0] rounded-md border border-[#d8d8d8] bg-white">
          {prerequisites.map(([name, requirement]) => (
            <li key={name} className="flex items-center justify-between gap-4 px-5 py-4">
              <code className="font-mono text-sm font-semibold">{name}</code>
              <span className="text-sm text-[#4d4d4d]">{requirement}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          daily commands
        </div>
        <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">
          Once installed, this is your loop.
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {dailyCommands.map(([label, command, description]) => (
            <div
              key={label}
              className="flex flex-col gap-3 rounded-md border border-[#d8d8d8] bg-[#f7f7f4] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#6f6f6f]">
                  {label}
                </div>
                <CopyButton value={command} />
              </div>
              <code className="block rounded-sm bg-[#111] px-3 py-2.5 font-mono text-sm text-[#7bd88f]">
                {command}
              </code>
              <p className="text-xs leading-5 text-[#555]">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ENV OVERRIDES */}
    <section>
      <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
        environment overrides
      </div>
      <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">
        Want it somewhere else? Pass env vars.
      </h2>
      <p className="mt-3 max-w-3xl text-base leading-7 text-[#4d4d4d]">
        Every variable below is optional. Set them before piping the installer to <code className="font-mono text-sm">sh</code> — for example,
        {' '}
        <code className="font-mono text-sm">KAREN_HOME=/opt/karen curl -fsSL …/install.sh | sh</code>.
      </p>

      <div className="mt-6 overflow-hidden rounded-md border border-[#d8d8d8] bg-white">
        <div className="hidden grid-cols-[1.1fr_1fr_1.6fr] gap-4 border-b border-[#e2ddd0] bg-[#f0ebdd] px-5 py-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#6f6f6f] md:grid">
          <div>Variable</div>
          <div>Default</div>
          <div>Purpose</div>
        </div>
        <ul className="divide-y divide-[#e2ddd0]">
          {envOverrides.map(([name, defaultValue, description]) => (
            <li
              key={name}
              className="grid gap-2 px-5 py-4 md:grid-cols-[1.1fr_1fr_1.6fr] md:items-center md:gap-4"
            >
              <code className="font-mono text-sm font-semibold">{name}</code>
              <code className="font-mono text-xs text-[#4d4d4d]">{defaultValue}</code>
              <span className="text-sm leading-6 text-[#4d4d4d]">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    {/* MANUAL + TROUBLESHOOTING */}
    <section className="grid gap-10 lg:grid-cols-2">
      <div>
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          manual install
        </div>
        <h2 className="text-2xl font-semibold sm:text-3xl">Don&apos;t pipe scripts? Do it by hand.</h2>
        <p className="mt-3 text-sm leading-6 text-[#4d4d4d]">
          The installer does nothing magic. Run the steps yourself if you prefer.
        </p>
        <div className="mt-5 rounded-md border border-[#111] bg-[#111] p-5 font-mono text-xs leading-6 text-[#f6f2e8] shadow-[6px_6px_0_#111]">
          <div className="text-[#6f6f6f]"># clone the repo</div>
          <div className="text-[#7bd88f]">git clone https://github.com/frederickemerson/karen.git ~/.karen</div>
          <div className="mt-2 text-[#6f6f6f]"># install dependencies</div>
          <div className="text-[#7bd88f]">cd ~/.karen &amp;&amp; bun install</div>
          <div className="mt-2 text-[#6f6f6f]"># write the launcher into ~/.local/bin</div>
          <div className="text-[#7bd88f]">node scripts/install-karen.mjs install</div>
          <div className="mt-2 text-[#6f6f6f]"># verify</div>
          <div className="text-[#7bd88f]">karen --help</div>
        </div>
      </div>

      <div>
        <div className="mb-4 font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          common snags
        </div>
        <h2 className="text-2xl font-semibold sm:text-3xl">If something looks off, start here.</h2>
        <dl className="mt-5 space-y-4">
          <div className="rounded-md border border-[#d8d8d8] bg-white p-4">
            <dt className="font-mono text-sm font-semibold">karen: command not found</dt>
            <dd className="mt-2 text-sm leading-6 text-[#4d4d4d]">
              <code className="font-mono text-xs">~/.local/bin</code> is not on your PATH. Add it to your shell profile:
              <code className="mt-2 block rounded-sm bg-[#111] px-3 py-2 font-mono text-xs text-[#7bd88f]">
                export PATH="$HOME/.local/bin:$PATH"
              </code>
            </dd>
          </div>
          <div className="rounded-md border border-[#d8d8d8] bg-white p-4">
            <dt className="font-mono text-sm font-semibold">Node 20+ required</dt>
            <dd className="mt-2 text-sm leading-6 text-[#4d4d4d]">
              Install or upgrade Node from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="underline">nodejs.org</a> (or use <code className="font-mono text-xs">nvm install 20</code>) and re-run the installer.
            </dd>
          </div>
          <div className="rounded-md border border-[#d8d8d8] bg-white p-4">
            <dt className="font-mono text-sm font-semibold">$KAREN_HOME exists but is not a git repo</dt>
            <dd className="mt-2 text-sm leading-6 text-[#4d4d4d]">
              Move or remove that directory, or set <code className="font-mono text-xs">KAREN_HOME</code> to a fresh path.
            </dd>
          </div>
        </dl>
        <p className="mt-5 text-sm leading-6 text-[#555]">
          Still stuck?{' '}
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Open a GitHub issue
          </a>{' '}
          with the installer output.
        </p>
      </div>
    </section>
  </div>
);
