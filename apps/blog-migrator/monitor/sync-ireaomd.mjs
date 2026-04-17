#!/usr/bin/env node
/**
 * sync-ireaomd.mjs
 *
 * Pulls the public sitemap from ireaomd.co.kr (sorted by lastmod = import
 * time, which is what the "newest on the site" dashboard cares about) and
 * fetches OG metadata for the top N posts in parallel.
 *
 * Why sitemap and not RSS?
 *   The RSS feed sorts by the *original Naver post date* (pubDate). Since
 *   the migrator imports *old* Naver posts, recently imported items do NOT
 *   show up at the top of the RSS. Sitemap's <lastmod> reflects import
 *   time, which matches what the user expects to see in a dashboard.
 *
 * Output: apps/blog-migrator/data/posts.json
 *   {
 *     source: "...",
 *     generated_at: "...",
 *     total: <total in sitemap>,
 *     posts: [ { link, lastmod, title, description, image, date } ... ]
 *   }
 *
 * Flags:
 *   --top=N            Fetch HTML for the N most recent posts (default 80)
 *   --concurrency=K    Max parallel HTML fetches (default 8)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '..', 'data', 'posts.json');
const SITEMAP_URL = 'https://ireaomd.co.kr/sitemap-posts.xml';
const UA = 'dolmaro-tools/1.0 (+https://dlfpomd.github.io/dolmaro-tools)';

const args = process.argv.slice(2).reduce((acc, a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) acc[m[1]] = m[2];
  return acc;
}, {});
const TOP = parseInt(args.top || '80', 10);
const CONCURRENCY = parseInt(args.concurrency || '8', 10);

function pickMeta(html, attr, key) {
  // <meta property="og:title" content="..."> or <meta name="..." content="...">
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
  const m = html.match(re);
  if (m) return decodeEntities(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["'][^>]*>`, 'i');
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1]) : '';
}

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function titleFromSlug(url) {
  try {
    const u = new URL(url);
    let slug = decodeURIComponent(u.pathname.replace(/^\/blog\//, '').replace(/\/$/, ''));
    slug = slug.replace(/-\d{6,}$/, ''); // strip trailing Naver logNo
    return slug.replace(/-/g, ' ');
  } catch {
    return url;
  }
}

async function fetchSitemap() {
  console.log(`[sync] fetching ${SITEMAP_URL}`);
  const res = await fetch(SITEMAP_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [];
  const re = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const mod = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
    if (loc) urls.push({ link: loc.trim(), lastmod: mod ? mod.trim() : null });
  }
  urls.sort((a, b) => (b.lastmod || '').localeCompare(a.lastmod || ''));
  return urls;
}

async function fetchMeta(link) {
  try {
    const res = await fetch(link, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!res.ok) return null;
    const html = await res.text();
    return {
      title: pickMeta(html, 'property', 'og:title') || pickMeta(html, 'name', 'og:title') || '',
      description: pickMeta(html, 'property', 'og:description') || pickMeta(html, 'name', 'description') || '',
      image: pickMeta(html, 'property', 'og:image') || '',
      date: pickMeta(html, 'property', 'article:published_time') || '',
    };
  } catch {
    return null;
  }
}

async function pool(items, size, worker) {
  const results = new Array(items.length);
  let idx = 0;
  async function run() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
  return results;
}

async function main() {
  const all = await fetchSitemap();
  console.log(`[sync] sitemap total: ${all.length}`);

  const topSlice = all.slice(0, TOP);
  console.log(`[sync] fetching OG metadata for top ${topSlice.length} (concurrency=${CONCURRENCY})...`);

  const t0 = Date.now();
  const metas = await pool(topSlice, CONCURRENCY, async (u) => fetchMeta(u.link));
  console.log(`[sync] metadata fetch done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const posts = all.map((u, i) => {
    const meta = i < topSlice.length ? metas[i] : null;
    const strippedTitle = meta?.title ? meta.title.replace(/\s*\|\s*이레한의원\s*$/, '').replace(/\s*\|\s*인천[^|]+$/, '').trim() : '';
    return {
      link: u.link,
      lastmod: u.lastmod,
      title: strippedTitle || titleFromSlug(u.link),
      description: meta?.description || '',
      image: meta?.image || '',
      date: meta?.date || u.lastmod,
    };
  });

  const payload = {
    source: SITEMAP_URL,
    generated_at: new Date().toISOString(),
    total: posts.length,
    top_detailed: topSlice.length,
    posts,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[sync] wrote ${posts.length} posts -> ${OUT_PATH}`);
  console.log('[sync] latest 3 by lastmod:');
  for (const p of posts.slice(0, 3)) {
    console.log(`  ${p.lastmod?.slice(0, 10)} · ${p.title.slice(0, 60)}`);
  }
}

main().catch((err) => {
  console.error('[sync] FAIL:', err.message);
  process.exit(1);
});
