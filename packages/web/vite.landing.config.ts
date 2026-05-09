import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeStoragePlugin } from '../../vite-theme-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel serves `index.html` natively for the root path. Vite emits the
// landing entry as `landing.html` (matching the source filename so it does
// not collide with the main app's `index.html`), so copy it to
// `index.html` in the output once the bundle is written. The rewrite in
// vercel.json still handles deep links to `/landing.html` and friends.
const emitIndexHtmlPlugin = (): Plugin => ({
  name: 'karen-landing-emit-index-html',
  apply: 'build',
  closeBundle() {
    const outDir = path.resolve(__dirname, '../../landing-dist');
    const src = path.join(outDir, 'landing.html');
    const dest = path.join(outDir, 'index.html');
    if (!fs.existsSync(src)) return;
    fs.copyFileSync(src, dest);
  },
});

// Standalone Vite config used by Vercel to build only the marketing/landing
// surface. The full OpenChamber app continues to build via vite.config.ts and
// is served by Express on the operator's machine + ngrok.
//
// Notes:
// - No PWA plugin: the landing is a static brochure, not an installable app.
// - No dev-server proxy: there is no /api on Vercel.
// - Output directory is repo-root `landing-dist` (not under packages/web) so
//   Vercel's default output path `landing-dist` matches the build, including
//   when Project Settings use the monorepo root as the Root Directory.
// - Only `landing.html` is an input; `index.html` and `mini-chat.html` are not
//   built here so OpenCode SDK, ghostty, codemirror, etc. are not bundled.
export default defineConfig({
  root: path.resolve(__dirname, '.'),
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    themeStoragePlugin(),
    emitIndexHtmlPlugin(),
  ],
  resolve: {
    alias: [
      { find: '@openchamber/ui', replacement: path.resolve(__dirname, '../ui/src') },
      { find: '@web', replacement: path.resolve(__dirname, './src') },
      { find: '@', replacement: path.resolve(__dirname, '../ui/src') },
    ],
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  build: {
    outDir: path.resolve(__dirname, '../../landing-dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, 'landing.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const match = id.split('node_modules/')[1];
          if (!match) return undefined;
          const segments = match.split('/');
          const packageName = match.startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0];
          if (packageName === 'react' || packageName === 'react-dom') return 'vendor-react';
          if (packageName === '@clerk/clerk-react' || packageName.startsWith('@clerk')) return 'vendor-clerk';
          if (packageName === 'convex') return 'vendor-convex';
          if (packageName === 'motion' || packageName.startsWith('motion-')) return 'vendor-motion';
          if (packageName === '@remixicon/react') return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
});
