import React from 'react';

const REPO_URL = 'https://github.com/frederickemerson/karen';

const commands = [
  ['Install', 'bun run install:karen'],
  ['Open shell', 'karen'],
  ['Guard TUI', '/tui'],
  ['Open GUI', '/gui'],
] as const;

const ONE_LINE_INSTALL_CMD =
  'curl -fsSL https://raw.githubusercontent.com/frederickemerson/karen/main/install.sh | sh';

export const Install: React.FC = () => (
  <section className="mx-auto grid max-w-7xl gap-10 px-4 py-10 lg:grid-cols-[0.9fr_1.1fr] sm:px-6 lg:px-8">
    <div>
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">install</div>
      <h2 className="mt-4 text-4xl font-semibold tracking-normal sm:text-5xl">
        One line. Then Karen judges every patch.
      </h2>
      <p className="mt-5 text-lg leading-8 text-[#4d4d4d]">
        Karen runs local-first. Prompt verdicts, sandbox runs, and diff quiz checks all start from your machine.
      </p>
      <div className="mt-6 rounded-md border border-[#111] bg-[#111] p-5 font-mono text-sm text-[#f6f2e8] shadow-[8px_8px_0_#111]">
        <div className="text-[#6f6f6f]"># Requires OpenCode CLI, Node 20+, and git (Bun auto-installs if missing)</div>
        <div className="mt-2 break-all text-[#7bd88f]">{ONE_LINE_INSTALL_CMD}</div>
        <div className="text-[#7bd88f]">karen</div>
      </div>
      <p className="mt-4 text-sm leading-6 text-[#555]">
        Questions or issues? <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline">Open a GitHub issue</a>.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      {commands.map(([label, command]) => (
        <div key={label} className="rounded-md border border-[#d8d8d8] bg-[#f7f7f4] p-5">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-[#6f6f6f]">{label}</div>
          <code className="mt-4 block rounded-sm bg-[#111] px-3 py-3 font-mono text-sm text-[#7bd88f]">{command}</code>
        </div>
      ))}
    </div>
  </section>
);
