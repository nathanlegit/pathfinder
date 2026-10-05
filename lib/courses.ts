// Courses that close the gap between the profile and the top-ranked opportunities:
// Claude names the gaps and writes queries -> TinyFish Search -> Fetch each course page to
// confirm title, provider, cost and length -> keep confirmed courses only.

import { search, fetchPages } from "./tinyfish";
import { planCourses, extractCourse } from "./llm";
import { mapLimit, shortUrl } from "./pipeline";
import type { Course, Profile, ProgressEvent } from "./types";

const PER_QUERY = 3;
const MAX_COURSES = 5;

export async function runCourses(profile: Profile, topOpportunities: string[], emit: (e: ProgressEvent) => void) {
  const log = (message: string) => emit({ type: "log", message });

  log("Finding skill gaps against your top opportunities…");
  const plan = await planCourses(profile, topOpportunities);
  emit({ type: "queries", queries: plan.queries });
  plan.gaps.forEach((g) => log(`Gap: ${g}`));

  // Search each gap's query and keep the top few results, tagged with the gap they close.
  const candidates: { url: string; gap: string }[] = [];
  await mapLimit(plan.queries, 3, async (q) => {
    const gap = plan.gaps[plan.queries.indexOf(q)] ?? q;
    log(`Searching: "${q}"`);
    try {
      const results = await search(q, { location: "GB", purpose: "Find a specific online course page with its price and duration." });
      results.slice(0, PER_QUERY).forEach((r) => candidates.push({ url: r.url, gap }));
    } catch (err) {
      log(`  Search failed: ${(err as Error).message}`);
    }
  });

  log(`Reading ${candidates.length} course pages…`);
  const { results, errors } = await fetchPages(
    candidates.map((c) => c.url).slice(0, 10),
    "Confirm this online course's title, provider, cost and length.",
  ).catch((err) => {
    log(`  Fetch failed: ${(err as Error).message}`);
    return { results: [], errors: [] };
  });
  errors.forEach((e) => log(`  Skipped ${shortUrl(e.url)}: ${e.error}`));

  const courses: Course[] = [];
  const usedGaps = new Map<string, number>();
  await mapLimit(results, 5, async (page) => {
    const url = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : "";
    if (text.length < 300) return;
    try {
      const c = await extractCourse(text, url);
      if (!c.is_course) {
        log(`  – ${shortUrl(url)} is not a single course`);
        return;
      }
      const gap = candidates.find((x) => x.url === page.url)?.gap ?? "";
      // At most 2 courses per gap so the list covers different gaps.
      if ((usedGaps.get(gap) ?? 0) >= 2) return;
      usedGaps.set(gap, (usedGaps.get(gap) ?? 0) + 1);
      courses.push({ title: c.title, provider: c.provider, cost: c.cost, length: c.length, url, fills_gap: gap });
      log(`  ✓ ${c.title} (${c.provider})`);
    } catch (err) {
      log(`  Extraction failed for ${shortUrl(url)}: ${(err as Error).message}`);
    }
  });

  emit({ type: "courses", courses: courses.slice(0, MAX_COURSES) });
  log(`Done: ${Math.min(courses.length, MAX_COURSES)} courses.`);
}
