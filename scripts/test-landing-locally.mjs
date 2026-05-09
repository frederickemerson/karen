#!/usr/bin/env node
// Mimic Vercel's static + rewrite + headers behaviour against the
// `landing-dist/` build so we can verify reachability before we ship a
// deploy. Reads `vercel.json` from the repo root and applies its
// outputDirectory, rewrites, headers, and cleanUrls semantics.
//
// Usage: node scripts/test-landing-locally.mjs [--port 4400]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
const outputDir = path.join(repoRoot, vercelJson.outputDirectory || 'landing-dist');
const cleanUrls = Boolean(vercelJson.cleanUrls);

// Compile a Vercel source pattern to a JS RegExp. Vercel source strings
// are interpreted as regex patterns anchored to the full pathname; the
// patterns currently in vercel.json (`/((?!.*\\.).*)`, `/assets/(.*)`,
// `/landing.html`) translate cleanly to JS regex once we anchor and
// escape the bare `/` prefix.
const compileSource = (source) => {
  const pattern = source.startsWith('/') ? source.slice(1) : source;
  return new RegExp(`^/${pattern}$`);
};

const rewrites = (vercelJson.rewrites || []).map((rule) => ({
  ...rule,
  regexp: compileSource(rule.source),
}));

const headerRules = (vercelJson.headers || []).map((rule) => ({
  ...rule,
  regexp: compileSource(rule.source),
}));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const safeJoin = (root, urlPath) => {
  const resolved = path.normalize(path.join(root, urlPath));
  if (!resolved.startsWith(root)) return null;
  return resolved;
};

const tryStatic = (urlPath) => {
  if (urlPath === '/') {
    const indexFile = safeJoin(outputDir, '/index.html');
    if (indexFile && fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) return indexFile;
    return null;
  }
  const direct = safeJoin(outputDir, urlPath);
  if (direct && fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (cleanUrls) {
    const html = safeJoin(outputDir, `${urlPath}.html`);
    if (html && fs.existsSync(html) && fs.statSync(html).isFile()) return html;
  }
  return null;
};

const applyHeaders = (urlPath, res) => {
  for (const rule of headerRules) {
    if (rule.regexp.test(urlPath)) {
      for (const header of rule.headers) res.setHeader(header.key, header.value);
    }
  }
};

const send = (res, status, urlPath, body, type) => {
  applyHeaders(urlPath, res);
  res.statusCode = status;
  if (type) res.setHeader('content-type', type);
  res.end(body);
};

const sendFile = (res, urlPath, filePath, status = 200) => {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);
  send(res, status, urlPath, body, type);
};

const handle = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  // 1. Static file (or cleanUrls .html resolution).
  const staticFile = tryStatic(pathname);
  if (staticFile) {
    sendFile(res, pathname, staticFile);
    return;
  }

  // 2. Rewrites — Vercel only rewrites when no static file matched.
  for (const rule of rewrites) {
    if (rule.regexp.test(pathname)) {
      const destPath = rule.destination.startsWith('/') ? rule.destination : `/${rule.destination}`;
      const target = safeJoin(outputDir, destPath);
      if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
        sendFile(res, pathname, target);
        return;
      }
    }
  }

  send(res, 404, pathname, `404 NOT_FOUND: ${pathname}`, 'text/plain; charset=utf-8');
};

const port = Number(process.argv.find((arg, i) => process.argv[i - 1] === '--port')) || 4400;
const server = http.createServer(handle);
server.listen(port, () => {
  console.log(`[karen-landing] serving ${outputDir} on http://127.0.0.1:${port}`);
  console.log(`[karen-landing] rewrites: ${rewrites.length}, headers: ${headerRules.length}, cleanUrls: ${cleanUrls}`);
});
