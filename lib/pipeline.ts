// Orchestrates one "Map my path" run:
// profile -> LLM queries -> TinyFish Search -> dedupe -> TinyFish Fetch (per page) -> LLM extract
// -> early LLM score + results -> final score + results -> Agent finds + re-rank.
// Every step reports friendly progress via lib/progress.ts; a failing URL or query is skipped.

import { search, fetchPages, runAgent, type SearchResult, type FetchedPage } from "./tinyfish";
import { hostOf, reporter, type Reporter } from "./progress";
import { generateQueries, extractOpportunities, scoreFit, type ExtractedOpportunity } from "./llm";
import { OPPORTUNITY_TYPES, type Opportunity, type Profile, type ProgressEvent } from "./types";

const MAX_CANDIDATES = 15;
const EARLY_AT = 8; // show the first ranked results once this many programmes are extracted
const MAX_AGENT_RUNS = 3; // Agent runs often take 1-2 minutes, so cap them per map
const AGENT_BUDGET_MS = 150_000;
const MIN_FETCH_CHARS = 800; // below this, Fetch probably got a JS shell, so try Agent
// Applicant-tracking portals that render with JavaScript; Fetch rarely gets the details.
const JS_HEAVY_HOSTS = ["myworkdayjobs.com", "workday.com", "oraclecloud.com", "greenhouse.io", "lever.co", "successfactors.com", "smartrecruiters.com"];
const BLOCKED_HOSTS = ["linkedin.com"]; // public pages only, never LinkedIn
const FETCH_PURPOSE =
  "Find early-careers programme details for students: programme name, eligibility (year of study, degree), location, application deadline and whether applications are open.";

// Run `fn` over `items` with at most `limit` in flight.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export function shortUrl(url: string): string {
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
  const r = reporter(emit);

  // 1. Plan queries.
  r.stage("plan");
  r.info("Reading your profile and planning searches");
  const queries = await generateQueries(profile, today);
  emit({ type: "queries", queries });

  // 2. TinyFish Search (3 at a time; the API allows 30 requests/min).
  r.stage("search");
  const resultsPerQuery = await mapLimit(queries, 3, async (q) => {
    r.search(q);
    try {
      const results = await search(q, { purpose: FETCH_PURPOSE });
      r.searched();
      return results;
    } catch (err) {
      r.info(`One search didn't come back, carrying on`);
      console.warn("search failed", q, err);
      return [];
    }
  });

  const candidates = pickCandidates(resultsPerQuery);
  r.info(`Shortlisted ${candidates.length} pages to read`);
  if (candidates.length === 0) {
    emit({ type: "results", opportunities: [] });
    r.stage("done");
    return;
  }

  // 3. Fetch each page on its own and extract as soon as it lands, so one slow page
  //    never holds up the rest. Pages Fetch can't read go to TinyFish Agent straight away.
  r.stage("read");
  const fetched: Item[] = [];
  const agentFound: Item[] = [];
  const agentRuns: Promise<void>[] = [];
  function queueAgent(url: string, reason: string) {
    if (agentRuns.length >= MAX_AGENT_RUNS) return;
    r.agent(`Sending TinyFish Agent to browse ${hostOf(url)}`, url);
    agentRuns.push(
      agentExtract(url)
        .then((records) => {
          records.forEach((record) => {
            agentFound.push({ record, url, via: "agent" });
            r.found(`${record.firm} · ${record.programme_name}`, url);
          });
        })
        .catch((err) => r.skip(url, `Agent: ${(err as Error).message}`)),
    );
    console.info("agent queued", url, reason);
  }

  // Early results: as soon as EARLY_AT programmes are extracted, score and show them.
  let early: { count: number; ranked: Opportunity[] } | null = null;
  let earlyRun: Promise<void> | null = null;
  const scoreItems = (items: Item[]) => scoreAll(profile, items, today, r);
  function maybeEmitEarly() {
    if (earlyRun || fetched.length < EARLY_AT) return;
    const batch = fetched.slice();
    earlyRun = scoreItems(batch).then((ranked) => {
      early = { count: batch.length, ranked };
      emit({ type: "results", opportunities: dedupe(ranked) });
    });
  }

  await mapLimit(candidates, 6, async (url) => {
    r.read(url);
    let page: FetchedPage | undefined;
    try {
      const { results, errors } = await fetchPages([url], FETCH_PURPOSE, false, 20_000);
      page = results[0];
      if (!page) {
        queueAgent(url, errors[0]?.error ?? "no content");
        return;
      }
    } catch (err) {
      r.skip(url, (err as Error).message);
      return;
    }
    const finalUrl = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : JSON.stringify(page.text ?? "");
    if (text.trim().length < MIN_FETCH_CHARS || JS_HEAVY_HOSTS.some((h) => finalUrl.includes(h))) {
      queueAgent(finalUrl, "javascript-rendered");
      return;
    }
    try {
      const records = await extractOpportunities(text, finalUrl, today);
      records.forEach((record) => {
        fetched.push({ record, url: finalUrl, via: "fetch" });
        r.found(`${record.firm} · ${record.programme_name}`, finalUrl);
      });
      maybeEmitEarly();
    } catch (err) {
      r.skip(finalUrl, (err as Error).message);
    }
  });

  // 4. Score whatever the early batch didn't cover, then show the full ranked list.
  r.stage("match");
  if (earlyRun) await earlyRun;
  const earlyResult = early as { count: number; ranked: Opportunity[] } | null;
  let ranked = earlyResult?.ranked ?? [];
  const rest = fetched.slice(earlyResult?.count ?? 0);
  if (rest.length) {
    r.info(`Matching ${rest.length} more programmes to you`);
    ranked = [...ranked, ...(await scoreItems(rest))];
  }
  emit({ type: "results", opportunities: dedupe(ranked) });

  // 5. Agent finds arrive last; add them and re-rank.
  if (agentRuns.length) {
    r.agent(`Still checking ${agentRuns.length} trickier page${agentRuns.length > 1 ? "s" : ""} with TinyFish Agent`);
    await Promise.all(agentRuns);
    if (agentFound.length) {
      ranked = [...ranked, ...(await scoreItems(agentFound))];
      emit({ type: "results", opportunities: dedupe(ranked) });
    }
  }
  r.info(`All done: ${dedupe(ranked).length} opportunities`);
  r.stage("done");
}

type Item = { record: ExtractedOpportunity; url: string; via: "fetch" | "agent" };

async function scoreAll(profile: Profile, items: Item[], today: string, r: Reporter): Promise<Opportunity[]> {
  if (!items.length) return [];
  let scores: { index: number; score: number; reason: string }[] = [];
  try {
    scores = await scoreFit(profile, items.map((e) => e.record), today);
  } catch (err) {
    r.info("Couldn't score some matches, showing them unranked");
    console.warn("scoring failed", err);
  }
  const byIndex = new Map(scores.map((s) => [s.index, s]));
  return items.map(({ record, url, via }, i) => ({
    ...record,
    source_url: url,
    score: byIndex.get(i)?.score ?? 0,
    reason: byIndex.get(i)?.reason ?? "not scored yet",
    via,
  }));
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
          type: { type: "string", enum: [...OPPORTUNITY_TYPES] },
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
    'Find the early-careers opportunities for students on this page (up to 5): internships, work experience, spring weeks, insight days, vacation schemes, residencies, fellowships, placements, graduate schemes or similar. Stay on this page or at most one linked programme page; do not search or apply. For each, return the firm, programme name, type, eligibility (year of study / degree), location, application deadline as YYYY-MM-DD (or "rolling" or "unknown" if not shown) and status (open, closed, opening soon or unknown). Only report what the site shows; never guess a deadline.',
    AGENT_SCHEMA,
    AGENT_BUDGET_MS,
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
  const onFirmSite = (o: Opportunity) => {
    try {
      const firstWord = norm(o.firm.split(/\s+/)[0] ?? "");
      return firstWord.length > 2 && norm(new URL(o.source_url).hostname).includes(firstWord);
    } catch {
      return false;
    }
  };
  // Two listings match when the firm matches and one programme name contains the other
  // (e.g. "Spring Insight Event" vs "2027 Spring Insight Event - EMEA").
  const prog = (o: Opportunity) => norm(o.programme_name.replace(/20\d\d/g, ""));
  const kept: Opportunity[] = [];
  for (const o of list) {
    const i = kept.findIndex(
      (k) => norm(k.firm) === norm(o.firm) && (prog(k).includes(prog(o)) || prog(o).includes(prog(k))),
    );
    if (i === -1) kept.push(o);
    else if ((onFirmSite(o) && !onFirmSite(kept[i])) || (onFirmSite(o) === onFirmSite(kept[i]) && o.score > kept[i].score)) {
      kept[i] = o;
    }
  }
  return kept.sort((a, b) => b.score - a.score);
}
