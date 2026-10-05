// Courses that close the gap between the profile and the top-ranked opportunities:
// Claude names the gaps and writes queries -> TinyFish Search -> Fetch each course page to
// confirm title, provider, cost and length -> keep confirmed courses only.

import { search, fetchPages } from "./tinyfish";
import { planCourses, extractCourse } from "./llm";
import { mapLimit } from "./pipeline";
import { hostOf, reporter } from "./progress";
import type { Course, Profile, ProgressEvent } from "./types";

const PER_QUERY = 3;
const MAX_COURSES = 5;

export async function runCourses(profile: Profile, topOpportunities: string[], emit: (e: ProgressEvent) => void) {
  const r = reporter(emit);

  r.stage("plan");
  r.info("Spotting the gaps between you and your top picks");
  const plan = await planCourses(profile, topOpportunities);
  emit({ type: "queries", queries: plan.queries });
  plan.gaps.forEach((g) => r.info(`Gap: ${g}`));
  r.stage("search");

  // Search each gap's query and keep the top few results, tagged with the gap they close.
  const candidates: { url: string; gap: string }[] = [];
  await mapLimit(plan.queries, 3, async (q) => {
    const gap = plan.gaps[plan.queries.indexOf(q)] ?? q;
    r.search(q);
    try {
      const results = await search(q, { location: "GB", purpose: "Find a specific online course page with its price and duration." });
      results.slice(0, PER_QUERY).forEach((r) => candidates.push({ url: r.url, gap }));
    } catch (err) {
      r.info("One search didn't come back, carrying on");
      console.warn(err);
    }
  });

  r.stage("read");
  candidates.slice(0, 10).forEach((c) => r.read(c.url));
  const { results, errors } = await fetchPages(
    candidates.map((c) => c.url).slice(0, 10),
    "Confirm this online course's title, provider, cost and length.",
  ).catch((err) => {
    r.info("Couldn't read the course pages this time");
    console.warn(err);
    return { results: [], errors: [] };
  });
  errors.forEach((e) => r.skip(e.url, e.error));
  r.stage("match");

  const courses: Course[] = [];
  const usedGaps = new Map<string, number>();
  await mapLimit(results, 5, async (page) => {
    const url = page.final_url || page.url;
    const text = typeof page.text === "string" ? page.text : "";
    if (text.length < 300) return;
    try {
      const c = await extractCourse(text, url);
      if (!c.is_course) {
        r.info(`${hostOf(url)} isn't a single course, skipping`);
        return;
      }
      const gap = candidates.find((x) => x.url === page.url)?.gap ?? "";
      // At most 2 courses per gap so the list covers different gaps.
      if ((usedGaps.get(gap) ?? 0) >= 2) return;
      usedGaps.set(gap, (usedGaps.get(gap) ?? 0) + 1);
      courses.push({ title: c.title, provider: c.provider, cost: c.cost, length: c.length, url, fills_gap: gap });
      r.found(`${c.title} · ${c.provider}`, url);
    } catch (err) {
      r.skip(url, (err as Error).message);
    }
  });

  emit({ type: "courses", courses: courses.slice(0, MAX_COURSES) });
  r.info(`All done: ${Math.min(courses.length, MAX_COURSES)} courses`);
  r.stage("done");
}
