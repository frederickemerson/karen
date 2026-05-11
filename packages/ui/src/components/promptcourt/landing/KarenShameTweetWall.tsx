import React from 'react';
import { motion } from 'motion/react';
import { RiChat3Line, RiRepeatLine, RiHeart3Line, RiVerifiedBadgeFill } from '@remixicon/react';

import { karenShameTweets } from './karenShameTweets';

export const KarenShameTweetWall: React.FC<{ className?: string }> = ({ className = '' }) => {
  // Top 6 tweets, rotated so the order shuffles every page load.
  const visible = React.useMemo(() => {
    const offset = Math.floor((Date.now() / 60000) % karenShameTweets.length);
    const rotated = [...karenShameTweets.slice(offset), ...karenShameTweets.slice(0, offset)];
    return rotated.slice(0, 6);
  }, []);

  return (
    <section
      className={`overflow-hidden rounded-md border border-[#2a2521] bg-[#0a0907] ${className}`}
      aria-label="Mock Karen X shame feed"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1d1915] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-[#b7332c] font-serif text-base font-bold text-[#fff8ec]">
            K
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#f6f2e8]">
              karen
              <RiVerifiedBadgeFill className="size-3.5 text-[#6ee7ff]" />
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6e60]">@karen-code</div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-sm border border-[#5fa572]/40 bg-[#5fa572]/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#a8e0b5]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#5fa572] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[#5fa572]" />
          </span>
          live · mock feed
        </div>
      </header>

      <div className="grid divide-y divide-[#1d1915] sm:grid-cols-2 sm:divide-y-0 sm:[&>article]:border-b sm:[&>article]:border-[#1d1915]">
        {visible.map((tweet, index) => (
          <motion.article
            key={tweet.id}
            className="px-5 py-4"
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.04 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1 text-sm font-semibold text-[#ff5a4d]">
                {tweet.victim}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">
                {tweet.postedAt}
              </div>
            </div>
            <p className="mt-2 text-sm leading-6 text-[#e8dfd0]">{tweet.body}</p>
            {tweet.charge ? (
              <div className="mt-3 inline-flex items-center rounded-sm border border-[#3a322b] bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#c9bca8]">
                {tweet.charge}
              </div>
            ) : null}
            <div className="mt-3 flex items-center gap-5 font-mono text-[10px] text-[#7a6e60]">
              <span className="inline-flex items-center gap-1">
                <RiChat3Line className="size-3.5" />
                12
              </span>
              <span className="inline-flex items-center gap-1">
                <RiRepeatLine className="size-3.5" />
                {tweet.retweets}
              </span>
              <span className="inline-flex items-center gap-1">
                <RiHeart3Line className="size-3.5" />
                {tweet.likes}
              </span>
            </div>
          </motion.article>
        ))}
      </div>

      <footer className="border-t border-[#1d1915] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[#7a6e60]">
        shame posts auto-queue from @karen-code when you fail a diff quiz on a public profile.
      </footer>
    </section>
  );
};

export default KarenShameTweetWall;
