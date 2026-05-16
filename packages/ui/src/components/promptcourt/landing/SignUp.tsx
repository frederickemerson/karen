import React from 'react';
import { SignUp as ClerkSignUp } from '@clerk/clerk-react';
import { isKarenAuthConfigured } from '../../../lib/karenCloudConfig';

const NotConfigured: React.FC = () => (
  <div className="mx-auto grid max-w-3xl gap-4 px-4 py-12 sm:px-6 lg:px-8">
    <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">setup required</div>
    <h1 className="text-4xl font-semibold leading-[1.05] tracking-normal">Sign-up is not wired on this deployment.</h1>
    <p className="max-w-xl text-base leading-7 text-[#4d4d4d]">
      Set <code className="rounded-sm bg-[#111] px-1 py-0.5 font-mono text-sm text-[#7bd88f]">VITE_CLERK_PUBLISHABLE_KEY</code> in the host&apos;s environment and redeploy.
    </p>
  </div>
);

export const SignUp: React.FC = () => {
  if (!isKarenAuthConfigured) return <NotConfigured />;
  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:px-8 lg:grid-cols-[1fr_440px] lg:items-start">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">create account</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
          Get a public profile on Karen.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
          One sign-up. Your terminal can link itself, your scoreboard goes public, and your prompts get judged in front of the class.
        </p>
      </div>
      <div className="rounded-md border border-[#111] bg-white p-4 shadow-[8px_8px_0_#111]">
        <ClerkSignUp routing="path" path="/signup" signInUrl="/signin" />
      </div>
    </div>
  );
};

export default SignUp;
