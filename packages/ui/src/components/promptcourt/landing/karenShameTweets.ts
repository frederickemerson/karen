export type KarenShameTweet = {
  id: string;
  victim: string;
  body: string;
  postedAt: string;
  likes: number;
  retweets: number;
};

export const karenShameTweets: KarenShameTweet[] = [
  {
    id: 'tweet-1',
    victim: '@maya.c',
    body: "Failed Karen's read check on TaskMaster auth/session.ts. Concept missed: closure scope. Re-read before the next commit.",
    postedAt: '2m',
    likes: 48,
    retweets: 9,
  },
  {
    id: 'tweet-2',
    victim: '@jo.tests',
    body: 'Claimed the agent migrated all call sites. It did not. git reset --hard. #karenCourt',
    postedAt: '11m',
    likes: 72,
    retweets: 17,
  },
  {
    id: 'tweet-3',
    victim: '@nora.diff',
    body: 'Three rollbacks in one hour. Karen suggests reading the interface before shipping the interface.',
    postedAt: '23m',
    likes: 61,
    retweets: 14,
  },
  {
    id: 'tweet-4',
    victim: '@eli.builds',
    body: 'Wrong answer on changed behavior. If you cannot defend the patch, you cannot keep the patch.',
    postedAt: '39m',
    likes: 54,
    retweets: 12,
  },
  {
    id: 'tweet-5',
    victim: '@sam.patch',
    body: "Said 'it should be fine' during the diff quiz. It was not fine.",
    postedAt: '52m',
    likes: 87,
    retweets: 25,
  },
  {
    id: 'tweet-6',
    victim: '@ava.api',
    body: 'Missed an interface contract change. Public scoreboard updated. Pride downgraded.',
    postedAt: '1h',
    likes: 95,
    retweets: 29,
  },
];
