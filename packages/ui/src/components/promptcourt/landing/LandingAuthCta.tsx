import React from 'react';
import { RiArrowRightLine, RiGithubFill } from '@remixicon/react';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';

import { isKarenAuthConfigured } from '@/lib/karenCloudConfig';

const REPO_URL = 'https://github.com/frederickemerson/karen';

const AuthButtons: React.FC = () => {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        <a
          href="/scoreboard"
          className="inline-flex items-center gap-1.5 rounded-sm bg-[#b7332c] px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fff8ec] hover:bg-[#9c2c25]"
        >
          My profile
          <RiArrowRightLine className="size-3.5" />
        </a>
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal" forceRedirectUrl="/scoreboard">
        <button
          type="button"
          className="rounded-sm border border-[#3a322b] bg-black/40 px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
        >
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/scoreboard">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-sm bg-[#b7332c] px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#fff8ec] hover:bg-[#9c2c25]"
        >
          Sign up
          <RiArrowRightLine className="size-3.5" />
        </button>
      </SignUpButton>
    </div>
  );
};

export const LandingAuthCta: React.FC = () => {
  if (!isKarenAuthConfigured) {
    return (
      <a
        href={REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-sm border border-[#3a322b] bg-black/40 px-3.5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f6f2e8] hover:border-[#c9bca8]"
      >
        <RiGithubFill className="size-3.5" />
        GitHub
      </a>
    );
  }

  return <AuthButtons />;
};

export default LandingAuthCta;
