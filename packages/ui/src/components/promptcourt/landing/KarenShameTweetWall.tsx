import React from 'react';
import { motion } from 'motion/react';
import { RiChat3Line, RiRepeatLine, RiHeart3Line } from '@remixicon/react';

import { karenShameTweets } from './karenShameTweets';

export const KarenShameTweetWall: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <section
      className={`rounded-md border border-[#17130f] bg-[#0e0c0a] p-4 text-[#f8f1e3] shadow-[8px_8px_0_#17130f] sm:p-5 ${className}`}
      aria-label="Mock Karen X shame feed"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-[#6ee7ff]">mock x feed</div>
          <h3 className="mt-2 text-2xl font-semibold tracking-normal">Name and shame from @karen-code.</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-sm border border-[#7bd88f]/30 bg-[#7bd88f]/10 px-2.5 py-1 font-mono text-xs text-[#b9f6c3]">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#7bd88f] opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-[#7bd88f]" />
          </span>
          live look, mock data
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {karenShameTweets.map((tweet, index) => (
          <motion.article
            key={tweet.id}
            className="rounded-sm border border-[#f8f1e3]/15 bg-[#17130f] p-3"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.04 }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-xs text-[#c9bca8]">@karen-code posted</div>
                <div className="mt-1 font-mono text-xs text-[#ff6b5f]">{tweet.victim}</div>
              </div>
              <div className="font-mono text-xs text-[#c9bca8]">{tweet.postedAt}</div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#f8f1e3]">{tweet.body}</p>
            <div className="mt-3 flex items-center gap-4 font-mono text-xs text-[#c9bca8]">
              <span className="inline-flex items-center gap-1"><RiChat3Line className="size-3.5" />12</span>
              <span className="inline-flex items-center gap-1"><RiRepeatLine className="size-3.5" />{tweet.retweets}</span>
              <span className="inline-flex items-center gap-1"><RiHeart3Line className="size-3.5" />{tweet.likes}</span>
            </div>
          </motion.article>
        ))}
      </div>

      <p className="mt-4 font-mono text-xs text-[#c9bca8]">
        Shame posts queue from @karen-code when you fail a diff quiz on a public profile.
      </p>
    </section>
  );
};
