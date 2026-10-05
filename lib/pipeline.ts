// Orchestrates one "Map my path" run:
// profile -> LLM queries -> TinyFish Search -> dedupe -> TinyFish Fetch -> LLM extract -> LLM score.
// Every step reports progress through `emit`; a failing URL or query is logged and skipped.

import { search, fetchPages, type SearchResult, type FetchedPage } from "./tinyfish";
import { generateQueries, extractOpportunities, scoreFit, type ExtractedOpportunity } from "./llm";
import type { Opportunity, Profile, ProgressEvent } from "./types";

const MAX_CANDIDATES = 15;
const BLOCKED_HOSTS = ["linkedin.com"]; // public pages only, never LinkedIn
const FETCH_PURPOSE =
  "Find early-careers programme details for students: programme name, eligibility (year of study, degree), location, application deadline and whether applications are open.";

// Run `fn` over `items` with at most `limit` in flight.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.length > 40 ? u.pathname.slice(0, 40) + "…" : u.pathname;
    return u.hostname.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}

// Dedupe by host+path, drop blocked hosts, and rank by how often and how high a URL appeared.
function pickCandidates(resultsPerQuery: SearchResult[][]): string[] {
  const scores = new Map<string, { url: string; score: number }>();
  for (const results of resultsPerQuery) {
    for (const r of results) {
      let key: string;
      try {
        const u = new URL(r.url);
        if (BLOCKED_HOSTS.some((h) => u.hostname.endsWith(h))) continue;
        key = u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
      } catch {
        continue;
      }
      const entry = scores.get(key) ?? { url: r.url, score: 0 };
      entry.score += 1 / (1 + (r.position ?? 10)); // higher positions and repeats score more
      scores.set(key, entry);
    }
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((e) => e.url);
}

export async function runPipeline(profile: Profile, emit: (e: ProgressEvent) => void) {
  const today = new Date().toISOString().slice(0, 10);
  const log = (message: string) => emit({ type: "log", message });

  // 1. Plan queries.
  log("Planning searches from your profile…");
  const queries = await generateQueries(profile, today);
  emit({ type: "queries", queries });

  // 2. TinyFish Search (3 at a time; the API allows 30 requests/min).
  const resultsPerQuery = await mapLimit(queries, 3, async (q) => {
    log(`Searching: "${q}"`);
    try {
      const results = await search(q, { purpose: FETCH_PURPOSE });
      log(`  ${results.length} results for "${q}"`);
      return results;
    } catch (err) {
      log(`  Search failed for "${q}": ${(err as Error).message}`);
      return [];
    }
  });

  const candidates = pickCandidates(resultsPerQuery);
  log(`Picked ${candidates.length} candidate pages to read.`);
  if (candidates.length === 0) {
    emit({ type: "results", opportunities: [] });
    return;
  }

  // 3. TinyFish Fetch in batches of 5 URLs (API max is 10; smaller batches return sooner).
  const batches: string[][] = [];
  for (let i = 0; i < candidates.length; i += 5) batches.push(candidates.slice(i, i + 5));

  const pages: FetchedPage[] = [];
  await mapLimit(batches, 3, async (batch) => {
    batch.forEach((u) => log(`Reading ${shortUrl(u)}`));
    try {
      const { results, errors } = await fetchPages(batch, FETCH_PURPOSE);
      pages.push(...results);
      errors.forEach((e) => log(`  Skipped ${shortUrl(e.url)}: ${e.error}`));
    } catch (err) {
      log(`  Fetch batch failed: ${(err as Error).message}`);
    }
  });

  // 4. Extract structured records from each page (5 LLM calls in flight).
  const extracted: { record: ExtractedOpportunity; url: string }[] = [];
  await mapLimit(pages, 5, async (page) => {
    const url = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : JSON.stringify(page.text ?? "");
    if (text.trim().length < 200) {
      log(`  Too little content on ${shortUrl(url)}, skipping`);
      return;
    }
    try {
      const records = await extractOpportunities(text, url, today);
      if (records.length === 0) log(`  No programme found on ${shortUrl(url)}`);
      else log(`  Found ${records.length} programme(s) on ${shortUrl(url)}`);
      records.forEach((record) => extracted.push({ record, url }));
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  // 5. Score fit in one call, then rank.
  log(`Scoring ${extracted.length} opportunities against your profile…`);
  let scores: { index: number; score: number; reason: string }[] = [];
  try {
    scores = await scoreFit(profile, extracted.map((e) => e.record), today);
  } catch (err) {
    log(`Scoring failed: ${(err as Error).message}`);
  }
  const byIndex = new Map(scores.map((s) => [s.index, s]));

  const opportunities: Opportunity[] = extracted
    .map(({ record, url }, i) => ({
      ...record,
      source_url: url,
      score: byIndex.get(i)?.score ?? 0,
      reason: byIndex.get(i)?.reason ?? "not scored",
      via: "fetch" as const,
    }))
    .sort((a, b) => b.score - a.score);

  log(`Done: ${opportunities.length} opportunities.`);
  emit({ type: "results", opportunities });
}
