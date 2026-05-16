import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, useClerk, useUser } from '@clerk/clerk-react';
import { useMutation, useQuery } from 'convex/react';
import { RiArrowRightLine, RiLogoutBoxRLine } from '@remixicon/react';
import { toast } from 'sonner';

import { api } from '../../../../../../convex/_generated/api';
import { isKarenAuthConfigured } from '../../../lib/karenCloudConfig';

const BIO_MAX = 200;

const isMaybeUrl = (value: string): boolean => {
  if (!value) return true;
  try {
    const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
    return Boolean(parsed.hostname.includes('.'));
  } catch {
    return false;
  }
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

type PublicProfile = {
  user: {
    username: string;
    bio?: string;
    links?: { github?: string; x?: string; website?: string };
  };
} | null;

const SignedOutPanel: React.FC = () => (
  <div className="mx-auto grid max-w-3xl gap-6 px-4 py-12 sm:px-6 lg:px-8">
    <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">profile</div>
    <h1 className="text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
      Sign in to edit your Karen profile.
    </h1>
    <p className="max-w-xl text-lg leading-8 text-[#4d4d4d]">
      Karen needs to know who you are before letting you write a bio. That is just basic hygiene.
    </p>
    <div>
      <SignInButton mode="modal" forceRedirectUrl="/profile">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8]"
        >
          Sign in <RiArrowRightLine className="size-4" />
        </button>
      </SignInButton>
    </div>
  </div>
);

const SignedInForm: React.FC = () => {
  const { user } = useUser();
  const clerk = useClerk();
  const username = user?.username || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || '';

  const profile = useQuery(api.karen.profilePublic, username ? { username } : 'skip') as PublicProfile | undefined;
  const updateMyProfile = useMutation(api.karen.updateMyProfile);

  const [bio, setBio] = React.useState('');
  const [github, setGithub] = React.useState('');
  const [x, setX] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const seededRef = React.useRef(false);

  React.useEffect(() => {
    if (seededRef.current) return;
    if (profile === undefined) return;
    seededRef.current = true;
    setBio(profile?.user?.bio ?? '');
    setGithub(profile?.user?.links?.github ?? '');
    setX(profile?.user?.links?.x ?? '');
    setWebsite(profile?.user?.links?.website ?? '');
  }, [profile]);

  const errors = React.useMemo(() => {
    const result: Record<string, string> = {};
    if (bio.length > BIO_MAX) result.bio = `Karen reads up to ${BIO_MAX} characters. Trim it.`;
    if (github && !isMaybeUrl(github)) result.github = 'That does not look like a URL.';
    if (x && !isMaybeUrl(x)) result.x = 'That does not look like a URL.';
    if (website && !isMaybeUrl(website)) result.website = 'That does not look like a URL.';
    return result;
  }, [bio, github, x, website]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      toast.error('Karen has notes. Fix them and try again.');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile({
        bio: bio.trim() || undefined,
        links: {
          github: github ? normalizeUrl(github) : undefined,
          x: x ? normalizeUrl(x) : undefined,
          website: website ? normalizeUrl(website) : undefined,
        },
      });
      toast.success('Saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Karen could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-8 px-4 py-12 sm:px-6 lg:px-8">
      <div>
        <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">your profile</div>
        <h1 className="mt-3 text-5xl font-semibold leading-[0.95] tracking-normal sm:text-6xl">
          @{username || 'you'}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {username ? (
            <RouterLink
              to={`/u/${encodeURIComponent(username)}`}
              className="inline-flex items-center gap-2 rounded-sm border border-[#111] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] hover:bg-[#111] hover:text-[#f6f2e8]"
            >
              View public profile <RiArrowRightLine className="size-3.5" />
            </RouterLink>
          ) : null}
          <button
            type="button"
            onClick={() => clerk.signOut({ redirectUrl: '/' })}
            className="inline-flex items-center gap-2 rounded-sm border border-[#b7332c] bg-white px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#b7332c] hover:bg-[#b7332c] hover:text-[#f6f2e8]"
          >
            <RiLogoutBoxRLine className="size-3.5" />
            Log out
          </button>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5">
        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#6f6f6f]">Bio</span>
          <textarea
            value={bio}
            onChange={(event) => setBio(event.target.value.slice(0, BIO_MAX + 50))}
            rows={4}
            className="rounded-sm border border-[#111] bg-white p-3 text-base"
            placeholder="One sentence. Karen reads short bios."
          />
          <div className="flex items-center justify-between font-mono text-[11px] text-[#6f6f6f]">
            <span className={errors.bio ? 'text-[#b7332c]' : undefined}>{errors.bio ?? ' '}</span>
            <span className={bio.length > BIO_MAX ? 'text-[#b7332c]' : undefined}>
              {bio.length}/{BIO_MAX}
            </span>
          </div>
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#6f6f6f]">GitHub</span>
          <input
            value={github}
            onChange={(event) => setGithub(event.target.value)}
            placeholder="https://github.com/your-handle"
            className="rounded-sm border border-[#111] bg-white p-3 text-base"
          />
          {errors.github ? <span className="font-mono text-[11px] text-[#b7332c]">{errors.github}</span> : null}
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#6f6f6f]">X</span>
          <input
            value={x}
            onChange={(event) => setX(event.target.value)}
            placeholder="https://x.com/your-handle"
            className="rounded-sm border border-[#111] bg-white p-3 text-base"
          />
          {errors.x ? <span className="font-mono text-[11px] text-[#b7332c]">{errors.x}</span> : null}
        </label>

        <label className="grid gap-1.5">
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-[#6f6f6f]">Website</span>
          <input
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="https://your.site"
            className="rounded-sm border border-[#111] bg-white p-3 text-base"
          />
          {errors.website ? <span className="font-mono text-[11px] text-[#b7332c]">{errors.website}</span> : null}
        </label>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-sm bg-[#111] px-5 py-3 font-mono text-sm font-semibold text-[#f6f2e8] disabled:opacity-60"
          >
            {saving ? 'Saving.' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

const ClerkNotConfigured: React.FC = () => (
  <div className="mx-auto grid max-w-3xl gap-4 px-4 py-12 sm:px-6 lg:px-8">
    <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#6f6f6f]">
      setup required
    </div>
    <h1 className="text-4xl font-semibold leading-[1.05] tracking-normal">
      Profile editing needs Clerk on this deployment.
    </h1>
    <p className="max-w-xl text-base leading-7 text-[#4d4d4d]">
      Set <code className="rounded-sm bg-[#111] px-1 py-0.5 font-mono text-sm text-[#7bd88f]">VITE_CLERK_PUBLISHABLE_KEY</code> and{' '}
      <code className="rounded-sm bg-[#111] px-1 py-0.5 font-mono text-sm text-[#7bd88f]">VITE_CONVEX_URL</code>{' '}
      in the host&apos;s environment variables and redeploy.
    </p>
  </div>
);

export const MyProfile: React.FC = () => {
  if (!isKarenAuthConfigured) return <ClerkNotConfigured />;
  return (
    <>
      <SignedOut>
        <SignedOutPanel />
      </SignedOut>
      <SignedIn>
        <SignedInForm />
      </SignedIn>
    </>
  );
};

export default MyProfile;
