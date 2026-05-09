#!/usr/bin/env node

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const resolveConvexUrl = () => {
  const candidates = [
    process.env.VITE_CONVEX_URL,
    process.env.NEXT_PUBLIC_CONVEX_URL,
    process.env.CONVEX_URL,
  ];
  return candidates.find((value) => typeof value === "string" && value.trim().length > 0) ?? null;
};

const convexUrl = resolveConvexUrl();
if (!convexUrl) {
  console.error(
    [
      "Missing Convex URL.",
      "Set one of: VITE_CONVEX_URL, NEXT_PUBLIC_CONVEX_URL, or CONVEX_URL.",
      "Example:",
      "  VITE_CONVEX_URL=https://<your-deployment>.convex.cloud bun scripts/check-convex-data.mjs",
    ].join("\n"),
  );
  process.exit(1);
}

try {
  const client = new ConvexHttpClient(convexUrl);
  const overview = await client.query(api.karen.overview, {});
  const totals = overview?.totals ?? {};
  const users = Number(totals.users ?? 0);
  const sessions = Number(totals.sessions ?? 0);
  const publicFailures = Number(totals.publicFailures ?? 0);
  const promotedRuns = Number(totals.promotedRuns ?? 0);
  const hasAnyData = users > 0 || sessions > 0 || publicFailures > 0 || promotedRuns > 0;

  console.log(`Convex URL: ${convexUrl}`);
  console.log("Karen overview totals:");
  console.log(`- users: ${users}`);
  console.log(`- sessions: ${sessions}`);
  console.log(`- publicFailures: ${publicFailures}`);
  console.log(`- promotedRuns: ${promotedRuns}`);
  console.log(`- hasAnyData: ${hasAnyData ? "yes" : "no"}`);

  const leaderboard = Array.isArray(overview?.leaderboard) ? overview.leaderboard : [];
  if (leaderboard.length > 0) {
    console.log("Top leaderboard users:");
    for (const [index, entry] of leaderboard.slice(0, 5).entries()) {
      const username = entry?.user?.username ?? "unknown";
      const score = entry?.stats?.disciplineScore ?? 0;
      console.log(`  ${index + 1}. ${username} (${score})`);
    }
  }
} catch (error) {
  console.error("Failed to query Convex Karen overview.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
