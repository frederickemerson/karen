import React from 'react';
import { RiCloseCircleFill, RiCheckboxCircleFill } from '@remixicon/react';

const bad = [
  '"fix the bug"',
  '"clean this up"',
  '"do your magic"',
  '"refactor"',
];

const good = [
  '"in auth/session.ts, expire tokens after 15 min idle; keep refresh tokens"',
  '"add empty-name validation to POST /api/users, return 400 with field error"',
  '"rename Task.due to Task.scheduledFor and migrate every call site"',
  '"replace map().filter() in feed.ts with a single reduce"',
];

export const ProblemPromptCompare: React.FC = () => (
  <div className="grid gap-6 lg:grid-cols-2">
    <div className="rounded-md border border-[#3a1f1c] bg-[#150c0b] p-5 sm:p-6">
      <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff5a4d]">
        <RiCloseCircleFill className="size-4" />
        what you type at 1 a.m.
      </div>
      <h3 className="mt-3 font-serif text-2xl font-semibold leading-tight text-[#f6f2e8] sm:text-3xl">
        "Just figure it out."
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#c9bca8]">
        No file. No expected behavior. No way to grade the result. The agent ships something. You have no idea what.
      </p>
      <ul className="mt-5 space-y-2 font-mono text-sm text-[#e8dfd0]">
        {bad.map((line) => (
          <li key={line} className="flex items-start gap-2 rounded-sm border border-[#3a1f1c] bg-[#0d0807] px-3 py-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#ff5a4d]" />
            <code>{line}</code>
          </li>
        ))}
      </ul>
      <div className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[#b7332c]/15 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ff5a4d]">
        karen says: which bug, dear?
      </div>
    </div>

    <div className="rounded-md border border-[#1f3a2b] bg-[#0c1510] p-5 sm:p-6">
      <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5fa572]">
        <RiCheckboxCircleFill className="size-4" />
        what karen accepts
      </div>
      <h3 className="mt-3 font-serif text-2xl font-semibold leading-tight text-[#f6f2e8] sm:text-3xl">
        Real targets. Real outcomes.
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#c9bca8]">
        File names. Functions. Behaviors. Enough scope that Karen can write a diff quiz that actually grades the patch.
      </p>
      <ul className="mt-5 space-y-2 font-mono text-sm text-[#e8dfd0]">
        {good.map((line) => (
          <li key={line} className="flex items-start gap-2 rounded-sm border border-[#1f3a2b] bg-[#080d0a] px-3 py-2">
            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#5fa572]" />
            <code>{line}</code>
          </li>
        ))}
      </ul>
      <div className="mt-5 inline-flex items-center gap-2 rounded-sm bg-[#5fa572]/15 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5fa572]">
        karen says: charges dismissed, proceed
      </div>
    </div>
  </div>
);

export default ProblemPromptCompare;
