// Orchestrates one "Map my path" run:
// profile -> LLM queries -> TinyFish Search -> dedupe -> TinyFish Fetch -> LLM extract -> LLM score.
// Every step reports progress through `emit`; a failing URL or query is logged and skipped.

import { search, fetchPages, runAgent, type SearchResult, type FetchedPage } from "./tinyfish";
import { generateQueries, extractOpportunities, scoreFit, type ExtractedOpportunity } from "./llm";
import type { Opportunity, Profile, ProgressEvent } from "./types";

const MAX_CANDIDATES = 15;
const MAX_AGENT_RUNS = 3; // Agent runs take 15-60s each, so cap them per map
const MIN_FETCH_CHARS = 800; // below this, Fetch probably got a JS shell, so try Agent
// Applicant-tracking portals that render with JavaScript; Fetch rarely gets the details.
const JS_HEAVY_HOSTS = ["myworkdayjobs.com", "workday.com", "oraclecloud.com", "greenhouse.io", "lever.co", "successfactors.com", "smartrecruiters.com"];
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
  const agentQueue: string[] = []; // URLs Fetch couldn't read well; TinyFish Agent gets a go
  await mapLimit(batches, 3, async (batch) => {
    batch.forEach((u) => log(`Reading ${shortUrl(u)}`));
    try {
      const { results, errors } = await fetchPages(batch, FETCH_PURPOSE);
      pages.push(...results);
      errors.forEach((e) => {
        log(`  Fetch couldn't read ${shortUrl(e.url)} (${e.error}), queued for Agent`);
        agentQueue.push(e.url);
      });
    } catch (err) {
      log(`  Fetch batch failed: ${(err as Error).message}`);
    }
  });

  // 4. Extract structured records from each page (5 LLM calls in flight).
  const extracted: { record: ExtractedOpportunity; url: string; via: "fetch" | "agent" }[] = [];
  await mapLimit(pages, 5, async (page) => {
    const url = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : JSON.stringify(page.text ?? "");
    if (text.trim().length < MIN_FETCH_CHARS || JS_HEAVY_HOSTS.some((h) => url.includes(h))) {
      log(`  ${shortUrl(url)} looks JavaScript-rendered, queued for Agent`);
      agentQueue.push(url);
      return;
    }
    try {
      const records = await extractOpportunities(text, url, today);
      if (records.length === 0) log(`  No programme found on ${shortUrl(url)}`);
      else log(`  Found ${records.length} programme(s) on ${shortUrl(url)}`);
      records.forEach((record) => extracted.push({ record, url, via: "fetch" }));
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  // 4b. TinyFish Agent for pages Fetch couldn't read (JS-heavy careers portals).
  const agentUrls = agentQueue.slice(0, MAX_AGENT_RUNS);
  await mapLimit(agentUrls, MAX_AGENT_RUNS, async (url) => {
    log(`Agent browsing ${shortUrl(url)}…`);
    try {
      const records = await agentExtract(url);
      log(`  Agent found ${records.length} programme(s) on ${shortUrl(url)}`);
      records.forEach((record) => extracted.push({ record, url, via: "agent" }));
    } catch (err) {
      log(`  Agent failed on ${shortUrl(url)}: ${(err as Error).message}`);
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
    .map(({ record, url, via }, i) => ({
      ...record,
      source_url: url,
      score: byIndex.get(i)?.score ?? 0,
      reason: byIndex.get(i)?.reason ?? "not scored",
      via,
    }))
    .sort((a, b) => b.score - a.score);

  const unique = dedupe(opportunities);
  if (unique.length < opportunities.length) log(`Merged ${opportunities.length - unique.length} duplicate listing(s).`);

  log(`Done: ${unique.length} opportunities.`);
  emit({ type: "results", opportunities: unique });
}

// ---------- Agent fallback ----------

const AGENT_SCHEMA = {
  type: "object",
  properties: {
    opportunities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          firm: { type: "string" },
          programme_name: { type: "string" },
          type: { type: "string", enum: ["spring week", "internship", "insight day", "other"] },
          eligibility: { type: "string" },
          location: { type: "string" },
          deadline: { type: "string" },
          status: { type: "string", enum: ["open", "closed", "opening soon", "unknown"] },
        },
        required: ["firm", "programme_name", "type", "eligibility", "location", "deadline", "status"],
      },
    },
  },
  required: ["opportunities"],
};

async function agentExtract(url: string): Promise<ExtractedOpportunity[]> {
  const run = await runAgent(
    url,
    'Find the spring week, insight day or first/second-year internship programmes on this careers site (up to 5). For each, return the firm, programme name, type, eligibility (year of study / degree), location, application deadline as YYYY-MM-DD (or "rolling" or "unknown" if not shown) and status (open, closed, opening soon or unknown). Only report what the site shows; never guess a deadline.',
    AGENT_SCHEMA,
  );
  // COMPLETED does not mean the goal succeeded, so validate the result shape.
  const result = run.result as { opportunities?: ExtractedOpportunity[] } | null;
  if (run.status !== "COMPLETED" || !Array.isArray(result?.opportunities)) {
    throw new Error(`no usable result (status ${run.status})`);
  }
  return result.opportunities.filter((o) => o.firm && o.programme_name).slice(0, 5);
}

// The same programme often appears on the firm's site and on listing sites.
// Keep one per firm+programme, preferring the firm's own site, then the higher score.
function dedupe(list: Opportunity[]): Opportunity[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const best = new Map<string, Opportunity>();
  const onFirmSite = (o: Opportunity) => {
    try {
      const firstWord = norm(o.firm.split(/\s+/)[0] ?? "");
      return firstWord.length > 2 && norm(new URL(o.source_url).hostname).includes(firstWord);
    } catch {
      return false;
    }
  };
  for (const o of list) {
    const key = norm(o.firm) + "|" + norm(o.programme_name.replace(/20\d\d/g, ""));
    const current = best.get(key);
    if (!current || (onFirmSite(o) && !onFirmSite(current)) || (onFirmSite(o) === onFirmSite(current) && o.score > current.score)) {
      best.set(key, o);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
