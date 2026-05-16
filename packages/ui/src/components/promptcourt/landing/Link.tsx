import React from 'react';
import { useSearchParams, Link as RouterLink } from 'react-router-dom';
import {
  SignedIn,
  SignedOut,
  SignUp,
  SignInButton,
  useUser,
} from '@clerk/clerk-react';
import { useMutation } from 'convex/react';

import { api } from '../../../../../../convex/_generated/api';
import { KarenMascot } from '../KarenMascot';

type ApproveState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; username?: string }
  | { kind: 'error'; message: string };

const normalizeCode = (input: string) => input.trim().toUpperCase();

const SignedOutPanel: React.FC<{ code: string | null }> = ({ code }) => {
  const redirectUrl = code ? `/link?code=${encodeURIComponent(code)}` : '/link';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_440px] lg:items-start">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          link your terminal
        </div>
        <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
          Sign up. Karen will tie this code to your account.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
          You ran <code className="rounded-sm bg-[#111] px-1.5 py-0.5 font-mono text-sm text-[#7bd88f]">karen login</code> in your terminal. Karen needs a name. Sign up and the device hooks itself up.
        </p>
        {code ? (
          <div className="mt-5 rounded-sm border border-[#111] bg-white p-3 font-mono text-sm">
            <span className="text-[#6f6f6f]">code: </span>
            <span className="font-semibold text-[#111]">{code}</span>
          </div>
        ) : (
          <div className="mt-5 rounded-sm border border-dashed border-[#b7332c]/40 bg-[#fff5f3] p-3 font-mono text-sm text-[#b7332c]">
            No code in the URL. Karen will still let you sign up. Paste your code below after.
          </div>
        )}
        <div className="mt-6 font-mono text-xs text-[#6f6f6f]">
          Already have an account?{' '}
          <SignInButton mode="modal" forceRedirectUrl={redirectUrl}>
            <button type="button" className="font-semibold text-[#b7332c] underline-offset-4 hover:underline">
              Sign in
            </button>
          </SignInButton>
        </div>
      </div>

      <div className="rounded-md border border-[#111] bg-white p-4 shadow-[8px_8px_0_#111]">
        <SignUp
          routing="path"
          path="/signup"
          forceRedirectUrl={redirectUrl}
          signInForceRedirectUrl={redirectUrl}
        />
      </div>
    </div>
  );
};

const SignedInPanel: React.FC<{ code: string | null }> = ({ code }) => {
  const { user } = useUser();
  const approveDeviceLink = useMutation(api.karen.approveDeviceLink);
  const [state, setState] = React.useState<ApproveState>({ kind: 'idle' });
  const [manualCode, setManualCode] = React.useState('');
  const triedRef = React.useRef<string | null>(null);

  const runApproval = React.useCallback(
    async (rawCode: string) => {
      const userCode = normalizeCode(rawCode);
      if (!userCode) {
        setState({ kind: 'error', message: 'A code is required to link.' });
        return;
      }
      setState({ kind: 'loading' });
      try {
        const result = (await approveDeviceLink({ userCode })) as { ok: boolean; username?: string } | undefined;
        if (result?.ok) {
          setState({ kind: 'success', username: result.username });
        } else {
          setState({ kind: 'error', message: 'Karen could not match that code.' });
        }
      } catch (error) {
        setState({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Karen could not link this device.',
        });
      }
    },
    [approveDeviceLink],
  );

  React.useEffect(() => {
    if (!code) return;
    const normalized = normalizeCode(code);
    if (triedRef.current === normalized) return;
    triedRef.current = normalized;
    void runApproval(normalized);
  }, [code, runApproval]);

  const handle = user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'you';

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
          terminal link
        </div>

        {state.kind === 'loading' ? (
          <>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
              Linking @{handle} to Karen.
            </h1>
            <p className="mt-5 text-lg leading-8 text-[#4d4d4d]">Karen is checking the code. Give her a second.</p>
          </>
        ) : null}

        {state.kind === 'success' ? (
          <>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
              Linked. Return to your terminal.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
              Karen now knows you are @{state.username || handle}. Your next prompt goes on your scoreboard.
            </p>
            {code ? (
              <p className="mt-3 font-mono text-xs text-[#6f6f6f]">
                If your terminal does not pick up the link, the code is{' '}
                <span className="font-semibold text-[#111]">{code}</span> (already approved).
              </p>
            ) : null}
            <div className="mt-7 flex flex-wrap gap-3">
              <RouterLink
                to={`/u/${encodeURIComponent(state.username || handle)}`}
                className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]"
              >
                See my public profile
              </RouterLink>
              <RouterLink
                to="/scoreboard"
                className="rounded-sm border border-[#111] px-5 py-3 font-mono text-sm font-semibold"
              >
                Open scoreboard
              </RouterLink>
            </div>
          </>
        ) : null}

        {state.kind === 'error' ? (
          <>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
              Could not link.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
              The code may have expired. Run <code className="rounded-sm bg-[#111] px-1.5 py-0.5 font-mono text-sm text-[#7bd88f]">karen login</code> again and try once more.
            </p>
            <p className="mt-2 font-mono text-xs text-[#b7332c]">{state.message}</p>
            <form
              className="mt-6 flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void runApproval(manualCode);
              }}
            >
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="WX7P-NQ4M"
                className="rounded-sm border border-[#111] bg-white px-3 py-2 font-mono text-sm uppercase tracking-[0.18em]"
                aria-label="Device code"
              />
              <button
                type="submit"
                className="rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f6f2e8]"
              >
                Retry link
              </button>
            </form>
          </>
        ) : null}

        {state.kind === 'idle' && !code ? (
          <>
            <h1 className="mt-4 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
              Paste the code from your terminal.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#4d4d4d]">
              Run <code className="rounded-sm bg-[#111] px-1.5 py-0.5 font-mono text-sm text-[#7bd88f]">karen login</code> in your terminal. It will print a code that looks like <span className="font-mono text-sm">WX7P-NQ4M</span>. Paste it below.
            </p>
            <form
              className="mt-6 flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void runApproval(manualCode);
              }}
            >
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="WX7P-NQ4M"
                className="rounded-sm border border-[#111] bg-white px-3 py-2 font-mono text-sm uppercase tracking-[0.18em]"
                aria-label="Device code"
              />
              <button
                type="submit"
                className="rounded-sm bg-[#111] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f6f2e8]"
              >
                Link this terminal
              </button>
            </form>
          </>
        ) : null}
      </div>

      <div className="relative">
        <KarenMascot
          className="h-[420px] max-h-[60dvh] border-[#111] bg-black shadow-[12px_12px_0_#111]"
          mood={state.kind === 'success' ? 'calm' : 'mad'}
        />
      </div>
    </div>
  );
};

export const Link: React.FC = () => {
  const [params] = useSearchParams();
  const codeParam = params.get('code');
  const code = codeParam && codeParam.length > 0 ? codeParam : null;

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:px-8">
      <SignedOut>
        <SignedOutPanel code={code} />
      </SignedOut>
      <SignedIn>
        <SignedInPanel code={code} />
      </SignedIn>
    </div>
  );
};

export default Link;
