// Research and People tabs. Both follow the same shape:
// Claude plans queries -> TinyFish Search -> TinyFish Fetch the top pages -> Claude extracts items.
// People only come from public pages: LinkedIn and social networks are excluded at search time.

import { search, fetchPages, type FetchedPage } from "./tinyfish";
import { planResearchQueries, extractResearch, planPeopleQueries, extractPeople } from "./llm";
import { mapLimit, shortUrl } from "./pipeline";
import type { Person, Profile, ProgressEvent, ResearchOpportunity } from "./types";

const SOCIAL = ["linkedin.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "tiktok.com"];
const MAX_PAGES = 10;

// Prefer the redirect target, unless it's a bare IP address (then keep the human-readable URL).
function sourceUrl(page: FetchedPage): string {
  const final = page.final_url || page.url;
  return /^https?:\/\/\d+\.\d+\.\d+\.\d+/.test(final) ? page.url : final;
}

// Searches every query, dedupes URLs, and fetches the top pages.
async function searchAndFetch(
  queries: string[],
  purpose: string,
  log: (m: string) => void,
  excludeDomains?: string[],
): Promise<FetchedPage[]> {
  const urls: string[] = [];
  await mapLimit(queries, 3, async (q) => {
    log(`Searching: "${q}"`);
    try {
      const results = await search(q, { purpose, excludeDomains });
      results.slice(0, 4).forEach((r) => {
        // Skip social networks and pages served from bare IP addresses (mirrors, not the source).
        const host = new URL(r.url).hostname;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || SOCIAL.some((d) => host.endsWith(d))) return;
        if (!urls.includes(r.url)) urls.push(r.url);
      });
    } catch (err) {
      log(`  Search failed: ${(err as Error).message}`);
    }
  });
  const targets = urls.slice(0, MAX_PAGES);
  targets.forEach((u) => log(`Reading ${shortUrl(u)}`));
  try {
    const { results, errors } = await fetchPages(targets, purpose);
    errors.forEach((e) => log(`  Skipped ${shortUrl(e.url)}: ${e.error}`));
    return results.filter((p) => typeof p.text === "string" && p.text.length > 300);
  } catch (err) {
    log(`  Fetch failed: ${(err as Error).message}`);
    return [];
  }
}

export async function runResearch(profile: Profile, emit: (e: ProgressEvent) => void) {
  const today = new Date().toISOString().slice(0, 10);
  const log = (message: string) => emit({ type: "log", message });

  const queries = await planResearchQueries(profile);
  emit({ type: "queries", queries });
  const pages = await searchAndFetch(queries, "Find undergraduate research schemes and whether undergraduates can apply.", log);

  const research: ResearchOpportunity[] = [];
  await mapLimit(pages, 5, async (page) => {
    const url = sourceUrl(page);
    try {
      const items = await extractResearch(page.text as string, url, profile, today);
      // Keep only items the page confirms (or doesn't rule out) for undergraduates.
      const kept = items.filter((i) => i.takes_undergraduates !== "no");
      kept.forEach((i) => research.push({ ...i, takes_undergraduates: i.takes_undergraduates as "yes" | "unknown", url }));
      log(kept.length ? `  ✓ ${kept.map((k) => k.name).join(", ")}` : `  – nothing for undergraduates on ${shortUrl(url)}`);
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  // Confirmed-for-undergraduates first.
  research.sort((a, b) => (a.takes_undergraduates === b.takes_undergraduates ? 0 : a.takes_undergraduates === "yes" ? -1 : 1));
  emit({ type: "research", research });
  log(`Done: ${research.length} research opportunities.`);
}

export async function runPeople(profile: Profile, topOpportunities: string[], emit: (e: ProgressEvent) => void) {
  const log = (message: string) => emit({ type: "log", message });

  const queries = await planPeopleQueries(profile, topOpportunities);
  emit({ type: "queries", queries });
  const pages = await searchAndFetch(
    queries,
    "Find named people (early-careers recruiters, speakers, researchers, society leads) on public pages.",
    log,
    SOCIAL,
  );

  const people: Person[] = [];
  await mapLimit(pages, 5, async (page) => {
    const url = sourceUrl(page);
    try {
      const found = await extractPeople(page.text as string, url, profile);
      found.forEach(({ name, role, organisation, why }) => people.push({ name, role, organisation, why, url }));
      if (found.length) log(`  ✓ ${found.map((p) => p.name).join(", ")} (${shortUrl(url)})`);
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  emit({ type: "people", people });
  log(`Done: ${people.length} people from public pages.`);
}
