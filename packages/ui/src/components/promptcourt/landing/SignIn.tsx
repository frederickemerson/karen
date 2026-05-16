import React from 'react';
import { SignIn as ClerkSignIn } from '@clerk/clerk-react';

export const SignIn: React.FC = () => (
  <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 lg:px-8 lg:grid-cols-[1fr_440px] lg:items-start">
    <div>
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">sign in</div>
      <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
        Back to court.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
        Sign in and Karen will remember your record. The scoreboard does not forget.
      </p>
    </div>
    <div className="rounded-md border border-[#111] bg-white p-4 shadow-[8px_8px_0_#111]">
      <ClerkSignIn routing="path" path="/signin" signUpUrl="/signup" />
    </div>
  </div>
);

export default SignIn;
