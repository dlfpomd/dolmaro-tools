#!/usr/bin/env node
/**
 * sync-ireaomd.mjs
 *
 * Pulls the public RSS feed from ireaomd.co.kr and writes a compact
 * posts.json for the dolmaro-tools blog-migrator dashboard to consume.
 *
 * Why not call the site directly from the browser?
 *   ireaomd.co.kr does not send CORS headers on rss.xml / sitemap, so
 *   a server-side fetch is needed. This script runs locally (WSL or
 *   Windows Node) and commits the JSON to the repo.
 *
 * Source:   https://ireaomd.co.kr/rss.xml  (all ~1010 published posts)
 * Output:   apps/blog-migrator/data/posts.json
 *
 * Usage:    node apps/blog-migrator/monitor/sync-ireaomd.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '..', 'data', 'posts.json');
const RSS_URL = 'https://ireaomd.co.kr/rss.xml';

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function pickTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeEntities(m[1]) : '';
}

function parseRss(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const title = pickTag(block, 'title');
    const link = pickTag(block, 'link');
    const description = pickTag(block, 'description').replace(/\s+/g, ' ');
    const pubDateRaw = pickTag(block, 'pubDate');
    const date = pubDateRaw ? new Date(pubDateRaw).toISOString() : null;
    if (title && link) items.push({ title, link, date, description });
  }
  return items;
}

async function main() {
  console.log(`[sync-ireaomd] fetching ${RSS_URL}`);
  const res = await fetch(RSS_URL, {
    headers: { 'User-Agent': 'dolmaro-tools/1.0 (+https://dlfpomd.github.io/dolmaro-tools)' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const items = parseRss(xml);
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const payload = {
    source: RSS_URL,
    generated_at: new Date().toISOString(),
    total: items.length,
    posts: items,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[sync-ireaomd] wrote ${items.length} posts to ${OUT_PATH}`);
  if (items[0]) console.log(`[sync-ireaomd] latest: ${items[0].date} · ${items[0].title}`);
}

main().catch((err) => {
  console.error('[sync-ireaomd] FAIL:', err.message);
  process.exit(1);
});
