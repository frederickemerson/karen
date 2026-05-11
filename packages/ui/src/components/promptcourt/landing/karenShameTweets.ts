export type KarenShameTweet = {
  id: string;
  victim: string;
  body: string;
  postedAt: string;
  likes: number;
  retweets: number;
  charge?: string;
};

export const karenShameTweets: KarenShameTweet[] = [
  {
    id: 'tweet-1',
    victim: '@maya.c',
    body: "Failed Karen's read check on auth/session.ts. Concept missed: closure scope. Re-read before the next commit, dear.",
    postedAt: '2m',
    likes: 48,
    retweets: 9,
    charge: 'PC-014 · unmeasured outcome',
  },
  {
    id: 'tweet-2',
    victim: '@jo.tests',
    body: 'Claimed the agent migrated all call sites. It did not. git reset --hard. #karenCourt',
    postedAt: '11m',
    likes: 72,
    retweets: 17,
    charge: 'PC-022 · scope creep, charged',
  },
  {
    id: 'tweet-3',
    victim: '@nora.diff',
    body: 'Three rollbacks in one hour. Karen suggests reading the interface before shipping the interface.',
    postedAt: '23m',
    likes: 61,
    retweets: 14,
    charge: 'PC-001 · vague intent',
  },
  {
    id: 'tweet-4',
    victim: '@eli.builds',
    body: 'Wrong answer on changed behavior. If you cannot defend the patch, you cannot keep the patch.',
    postedAt: '39m',
    likes: 54,
    retweets: 12,
    charge: 'PC-007 · abdication of scope',
  },
  {
    id: 'tweet-5',
    victim: '@sam.patch',
    body: "Said 'it should be fine' during the diff quiz. It was not fine.",
    postedAt: '52m',
    likes: 87,
    retweets: 25,
    charge: 'PC-003 · cosmetic dressed as substance',
  },
  {
    id: 'tweet-6',
    victim: '@ava.api',
    body: 'Missed an interface contract change. Public scoreboard updated. Pride downgraded.',
    postedAt: '1h',
    likes: 95,
    retweets: 29,
    charge: 'PC-022 · scope creep, charged',
  },
  {
    id: 'tweet-7',
    victim: '@dev.null',
    body: '"fix the bug." Which bug, dear? Karen needs at least one noun.',
    postedAt: '1h',
    likes: 128,
    retweets: 41,
    charge: 'PC-001 · vague intent',
  },
  {
    id: 'tweet-8',
    victim: '@kim.refactor',
    body: 'Asked the agent to "clean things up." The agent cleaned up the tests. Karen rolled it back.',
    postedAt: '2h',
    likes: 76,
    retweets: 19,
    charge: 'PC-003 · cosmetic dressed as substance',
  },
];
