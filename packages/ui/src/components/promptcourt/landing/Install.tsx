import React from 'react';
import { RiFileCopyLine, RiCheckLine, RiTerminalBoxLine } from '@remixicon/react';

const REPO_URL = 'https://github.com/frederickemerson/karen';

const ONE_LINE_INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh';

type Tab = 'curl' | 'bun' | 'npm';

const tabs: Array<{ id: Tab; label: string; command: string; note: string }> = [
  {
    id: 'curl',
    label: 'curl',
    command: ONE_LINE_INSTALL_CMD,
    note: 'Auto-installs Bun if missing. Then `karen`.',
  },
  {
    id: 'bun',
    label: 'bun',
    command: 'bun add -g @karen-code/cli && karen init',
    note: 'For repos already using Bun.',
  },
  {
    id: 'npm',
    label: 'npm',
    command: 'npm i -g @karen-code/cli && karen init',
    note: 'Works on Node 20+.',
  },
];

const commands = [
  ['Start the courtroom', 'karen'],
  ['Open guard TUI', '/tui'],
  ['Open scoreboard GUI', '/gui'],
  ['Inspect last verdict', '/verdict'],
] as const;

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore — fall back to manual selection
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-sm border border-[#3a322b] bg-black/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9bca8] hover:border-[#c9bca8] hover:text-[#f6f2e8]"
      aria-label="Copy command"
    >
      {copied ? <RiCheckLine className="size-3.5 text-[#7bd88f]" /> : <RiFileCopyLine className="size-3.5" />}
      {copied ? 'copied' : 'copy'}
    </button>
  );
};

export const Install: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<Tab>('curl');
  const active = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div className="rounded-md border border-[#2a2521] bg-[#0a0907] p-5 sm:p-6">
        <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
          <RiTerminalBoxLine className="size-3.5" />
          one line, three flavors
        </div>

        <div className="mt-4 flex items-center gap-1 border-b border-[#1d1915]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-3 py-2 font-mono text-xs uppercase tracking-[0.16em] transition ${
                tab.id === activeTab
                  ? 'text-[#ffcc66]'
                  : 'text-[#7a6e60] hover:text-[#c9bca8]'
              }`}
            >
              {tab.label}
              {tab.id === activeTab ? (
                <span className="absolute inset-x-0 -bottom-px h-px bg-[#ffcc66]" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-sm border border-[#1d1915] bg-[#050403]">
          <div className="flex items-center justify-between border-b border-[#1d1915] px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">
              ~ · zsh
            </span>
            <CopyButton text={active.command} />
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-sm leading-6 text-[#7bd88f]">
            <span className="text-[#7a6e60]">$ </span>
            {active.command}
          </pre>
        </div>
        <p className="mt-3 text-xs leading-5 text-[#7a6e60]">{active.note}</p>

        <p className="mt-5 text-sm leading-6 text-[#c9bca8]">
          Karen runs local-first. Prompt verdicts, sandbox runs, and diff quizzes start on your machine. The scoreboard is opt-in.
        </p>
        <p className="mt-3 text-xs leading-5 text-[#7a6e60]">
          Stuck? <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-[#c9bca8] underline hover:text-[#f6f2e8]">Open a GitHub issue</a>.
        </p>
      </div>

      <div className="rounded-md border border-[#2a2521] bg-[#0a0907] p-5 sm:p-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7a6e60]">
          common commands
        </div>
        <ul className="mt-4 space-y-3">
          {commands.map(([label, command]) => (
            <li key={label} className="rounded-sm border border-[#1d1915] bg-[#050403] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">{label}</span>
                <CopyButton text={command} />
              </div>
              <code className="mt-2 block font-mono text-sm text-[#7bd88f]">
                <span className="text-[#7a6e60]">$ </span>
                {command}
              </code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Install;
