// Finds upcoming London events on Luma relevant to the profile:
// TinyFish Search (Luma domains only) -> Fetch pages (with links) -> follow event links found on
// calendar pages -> Fetch event pages -> Claude extracts + rates -> keep future events only.
// Event pages Fetch can't read go to TinyFish Agent. We never register for anything.

import { search, fetchPages, runAgent, type FetchedPage } from "./tinyfish";
import { extractEvent, type ExtractedEvent } from "./llm";
import { mapLimit, shortUrl } from "./pipeline";
import type { LumaEvent, Profile, ProgressEvent } from "./types";

const LUMA_DOMAINS = ["lu.ma", "luma.com"];
const MAX_EVENT_PAGES = 25;
const MAX_AGENT_RUNS = 2;
const MIN_CHARS = 400;
// Luma's public London calendars list upcoming events; search hits are often past events.
const SEED_CALENDARS = ["https://luma.com/london", "https://luma.com/discover/london/ai", "https://luma.com/discover/london/tech"];
const PURPOSE = "Find upcoming events in London: title, date, time, venue, organiser and registration link.";

// Luma event pages live at a single path segment, e.g. luma.com/t01d0nqa.
// Calendar/discover pages and reserved paths are excluded.
const RESERVED = new Set(["discover", "signin", "london", "ai", "home", "create", "explore", "pricing", "calendar", "user", "tech", "map", "privacy", "terms", "help", "ios", "android"]);
function isEventUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!LUMA_DOMAINS.some((d) => u.hostname.endsWith(d))) return false;
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length === 1 && !RESERVED.has(parts[0].toLowerCase());
  } catch {
    return false;
  }
}

function canonical(url: string): string {
  const u = new URL(url);
  return "https://luma.com" + u.pathname.replace(/\/$/, "");
}

function eventQueries(p: Profile): string[] {
  const paths = p.targetPaths.length ? p.targetPaths : ["tech"];
  const fromPaths = paths.slice(0, 3).map((path) => `London ${path} event students`);
  return [...fromPaths, "London hackathon", "London careers insight evening students", `London ${p.interests.split(",")[0] || "AI"} meetup`];
}

export async function runEvents(profile: Profile, emit: (e: ProgressEvent) => void) {
  const today = new Date().toISOString().slice(0, 10);
  const log = (message: string) => emit({ type: "log", message });

  // 1. Search Luma.
  const queries = eventQueries(profile);
  emit({ type: "queries", queries: queries.map((q) => `${q} (Luma)`) });
  const found = new Set<string>();
  await mapLimit(queries, 3, async (q) => {
    log(`Searching Luma: "${q}"`);
    try {
      const results = await search(q, { includeDomains: LUMA_DOMAINS, purpose: PURPOSE });
      results.forEach((r) => found.add(r.url));
    } catch (err) {
      log(`  Search failed: ${(err as Error).message}`);
    }
  });

  // 2. Split into event pages and calendar pages; read calendars to collect their event links.
  const searchEvents = new Set<string>();
  const calendars = [...SEED_CALENDARS];
  for (const url of found) {
    if (isEventUrl(url)) searchEvents.add(canonical(url));
    else if (!calendars.includes(url)) calendars.push(url);
  }
  log(`${searchEvents.size} event pages and ${calendars.length} calendar pages found.`);

  const firstPass: FetchedPage[] = [];
  const calBatches: string[][] = [];
  for (let i = 0; i < Math.min(calendars.length, 10); i += 5) calBatches.push(calendars.slice(i, i + 5));
  await mapLimit(calBatches, 2, async (batch) => {
    batch.forEach((u) => log(`Reading calendar ${shortUrl(u)}`));
    try {
      const { results } = await fetchPages(batch, PURPOSE, true);
      firstPass.push(...results);
    } catch (err) {
      log(`  Fetch failed: ${(err as Error).message}`);
    }
  });
  // Calendar links first (they are upcoming), then search hits.
  const eventUrls = new Set<string>();
  for (const page of firstPass) {
    (page.links ?? []).filter(isEventUrl).forEach((l) => eventUrls.add(canonical(l)));
  }
  log(`${eventUrls.size} upcoming event links from calendars.`);
  searchEvents.forEach((u) => eventUrls.add(u));

  // 3. Fetch the event pages themselves.
  const targets = [...eventUrls].slice(0, MAX_EVENT_PAGES);
  log(`Reading ${targets.length} event pages…`);
  const batches: string[][] = [];
  for (let i = 0; i < targets.length; i += 10) batches.push(targets.slice(i, i + 10));
  const pages: FetchedPage[] = [];
  const agentQueue: string[] = [];
  await mapLimit(batches, 2, async (batch) => {
    try {
      const { results, errors } = await fetchPages(batch, PURPOSE);
      pages.push(...results);
      errors.forEach((e) => agentQueue.push(e.url));
    } catch (err) {
      log(`  Fetch failed: ${(err as Error).message}`);
    }
  });

  // 4. Extract and rate each event; thin pages go to Agent.
  const events: LumaEvent[] = [];
  const keep = (e: ExtractedEvent, url: string, via: "fetch" | "agent") => {
    if (!e.is_event || e.is_past || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date < today) return false;
    events.push({ title: e.title, date: e.date, time: e.time, venue: e.venue, organiser: e.organiser, url, score: e.score, why: e.why, via });
    return true;
  };

  await mapLimit(pages, 5, async (page) => {
    const url = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : "";
    if (text.length < MIN_CHARS) {
      agentQueue.push(url);
      return;
    }
    try {
      const e = await extractEvent(text, url, profile, today);
      log(keep(e, url, "fetch") ? `  ✓ ${e.title} (${e.date})` : `  – skipped ${shortUrl(url)} (${e.is_past ? "past" : !e.is_event ? "not an event" : `date ${e.date}`})`);
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  // Show what we have, then let Agent add to it.
  // Hide clearly irrelevant events (book clubs, cooking) but keep anything plausibly useful.
  const sorted = () => events.filter((e) => e.score >= 15).sort((a, b) => b.score - a.score);
  emit({ type: "events", events: sorted() });

  const agentUrls = agentQueue.slice(0, MAX_AGENT_RUNS);
  if (agentUrls.length) {
    log(`Sending TinyFish Agent to ${agentUrls.length} page(s) Fetch couldn't read…`);
    await mapLimit(agentUrls, MAX_AGENT_RUNS, async (url) => {
      try {
        const run = await runAgent(
          url,
          "Return this event's title, date (YYYY-MM-DD), time, venue, organiser and whether it is a past event. Do not register or click any registration button.",
          {
            type: "object",
            properties: {
              title: { type: "string" },
              date: { type: "string" },
              time: { type: "string" },
              venue: { type: "string" },
              organiser: { type: "string" },
              is_past: { type: "boolean" },
            },
            required: ["title", "date", "time", "venue", "organiser", "is_past"],
          },
          90_000,
        );
        const r = run.result as Partial<ExtractedEvent> | null;
        if (run.status !== "COMPLETED" || !r?.title) throw new Error("no usable result");
        // Agent output has no relevance rating, so rate it from its own fields.
        const e = await extractEvent(JSON.stringify(r), url, profile, today);
        if (keep({ ...e, is_event: true }, url, "agent")) log(`  ✓ ${e.title} (${e.date}) via Agent`);
      } catch (err) {
        log(`  Agent failed on ${shortUrl(url)}: ${(err as Error).message}`);
      }
    });
    emit({ type: "events", events: sorted() });
  }

  log(`Done: ${events.length} upcoming events.`);
}
