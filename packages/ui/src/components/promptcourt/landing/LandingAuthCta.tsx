import React from 'react';
import { RiArrowRightLine } from '@remixicon/react';
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/clerk-react';

import { isKarenAuthConfigured } from '@/lib/karenCloudConfig';

const REPO_URL = 'https://github.com/frederickemerson/karen';

const AuthButtons: React.FC = () => {
  const { isSignedIn } = useUser();

  if (isSignedIn) {
    return (
      <div className="flex items-center gap-2">
        <a href="/scoreboard" className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]">
          My profile <RiArrowRightLine className="size-4" />
        </a>
        <UserButton afterSignOutUrl="/" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInButton mode="modal" forceRedirectUrl="/scoreboard">
        <button type="button" className="rounded-sm border border-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#111]">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/scoreboard">
        <button type="button" className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]">
          Sign up <RiArrowRightLine className="size-4" />
        </button>
      </SignUpButton>
    </div>
  );
};

export const LandingAuthCta: React.FC = () => {
  if (!isKarenAuthConfigured) {
    return (
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold text-[#f6f2e8]">
        GitHub <RiArrowRightLine className="size-4" />
      </a>
    );
  }

  return <AuthButtons />;
};
