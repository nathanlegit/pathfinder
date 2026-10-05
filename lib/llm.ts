// Claude calls: the LLM only plans queries, extracts fields from fetched pages, and scores fit.
// It never supplies facts of its own; every record comes from a page TinyFish fetched.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Profile } from "./types";

const client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

// Low effort keeps latency down: these are short, well-specified extraction tasks.
async function parse<T extends z.ZodType>(schema: T, system: string, user: string) {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`LLM returned no parsed output (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output as z.infer<T>;
}

function describeProfile(p: Profile): string {
  return [
    `University: ${p.university}`,
    `Degree: ${p.degree}`,
    `Year of study: ${p.yearOfStudy}`,
    `Target paths: ${p.targetPaths.join(", ") || "not specified"}`,
    `Interests: ${p.interests}`,
    `Location preferences: ${p.locations}`,
    `Experience: ${p.experience}`,
    p.cvText ? `CV:\n${p.cvText.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------- Query generation ----------

const QueriesSchema = z.object({ queries: z.array(z.string()) });

export async function generateQueries(profile: Profile, today: string): Promise<string[]> {
  const out = await parse(
    QueriesSchema,
    "You plan web searches that find live early-careers programmes (spring weeks, insight days, first/second-year internships) for a university student. Write short keyword queries like a person would type into a search engine. Prefer queries that surface official firm careers pages or reputable listing sites.",
    `Today is ${today}.\n\nStudent profile:\n${describeProfile(profile)}\n\nReturn 6 search queries, each targeting a different path or programme type the student is eligible for. Include the relevant recruiting year and location in each query.`,
  );
  return out.queries.slice(0, 8);
}

// ---------- Extraction ----------

const ExtractedSchema = z.object({
  is_opportunity: z
    .boolean()
    .describe("true only if the page describes a specific programme a student can apply to"),
  opportunities: z.array(
    z.object({
      firm: z.string(),
      programme_name: z.string(),
      type: z.enum(["spring week", "internship", "insight day", "other"]),
      eligibility: z.string().describe('year of study / degree requirements, or "unknown"'),
      location: z.string(),
      deadline: z.string().describe('ISO date YYYY-MM-DD, "rolling", or "unknown"'),
      status: z.enum(["open", "closed", "opening soon", "unknown"]),
    }),
  ),
});

export type ExtractedOpportunity = z.infer<typeof ExtractedSchema>["opportunities"][number];

export async function extractOpportunities(
  pageText: string,
  url: string,
  today: string,
): Promise<ExtractedOpportunity[]> {
  const out = await parse(
    ExtractedSchema,
    'You extract early-careers programme details from a web page. Use only facts stated on the page. If a field is not on the page, write "unknown". Never infer or guess a deadline. If the page is a list of several programmes, return up to 5 of the most relevant early-careers ones. If the page is not about an applicable programme (news article, generic blog, login wall), set is_opportunity=false and return an empty list.',
    `Today is ${today}.\nSource URL: ${url}\n\nPage content:\n${pageText.slice(0, 15_000)}`,
  );
  return out.is_opportunity ? out.opportunities.slice(0, 5) : [];
}

// ---------- Fit scoring ----------

const ScoresSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().int().describe("0-100"),
      reason: z.string().describe("one line citing concrete facts"),
    }),
  ),
});

export async function scoreFit(
  profile: Profile,
  records: ExtractedOpportunity[],
  today: string,
): Promise<{ index: number; score: number; reason: string }[]> {
  if (records.length === 0) return [];
  const list = records.map((r, i) => `[${i}] ${JSON.stringify(r)}`).join("\n");
  const out = await parse(
    ScoresSchema,
    'You score how well each early-careers opportunity fits a student, 0-100. Give one short reason per item that cites concrete facts (e.g. "first-years eligible, closes 31 Oct, matches ML interest"). Rank ineligible (wrong year of study) or closed items low but still score them. Unknown deadlines are not a penalty on their own.',
    `Today is ${today}.\n\nStudent profile:\n${describeProfile(profile)}\n\nOpportunities:\n${list}\n\nReturn one score per index.`,
  );
  return out.scores;
}

// ---------- Events ----------

const EventSchema = z.object({
  is_event: z.boolean().describe("true only if the page is a single specific event"),
  title: z.string(),
  date: z.string().describe('YYYY-MM-DD, or "unknown"'),
  time: z.string(),
  venue: z.string(),
  organiser: z.string(),
  is_past: z.boolean().describe('true if the page says "Past Event" or the date is before today'),
  score: z.number().int().describe("0-100 relevance to the student"),
  why: z.string().describe("one line on why it is relevant to this student"),
});

export type ExtractedEvent = z.infer<typeof EventSchema>;

export async function extractEvent(
  pageText: string,
  url: string,
  profile: Profile,
  today: string,
): Promise<ExtractedEvent> {
  return parse(
    EventSchema,
    'You extract details of one event from an event page (usually Luma) and rate its relevance to a student. Use only facts on the page. Event pages often show a weekday and day without a year: resolve the year as the next occurrence on or after today unless the page says "Past Event". Write "unknown" for missing fields. Careers fairs, firm insight evenings, hackathons and talks matching the student\'s paths score highest; generic networking or paid workshops score lower.',
    `Today is ${today}.\nSource URL: ${url}\n\nStudent profile:\n${describeProfile(profile)}\n\nPage content:\n${pageText.slice(0, 8000)}`,
  );
}

// ---------- Courses ----------

const CoursePlanSchema = z.object({
  gaps: z.array(z.string()).describe("2-3 concrete skill gaps between the student and their top opportunities"),
  queries: z.array(z.string()).describe("one search query per gap for a free or low-cost online course"),
});

export async function planCourses(profile: Profile, topOpportunities: string[]) {
  return parse(
    CoursePlanSchema,
    "You find the skill gaps between a student and the early-careers programmes they are targeting, then write web search queries for well-known online courses (Coursera, edX, MIT OCW, fast.ai, Khan Academy, university MOOCs) that close each gap.",
    `Student profile:\n${describeProfile(profile)}\n\nTop target opportunities:\n${topOpportunities.join("\n") || "(none yet: use their target paths)"}\n\nReturn 3 gaps and 3 queries.`,
  );
}

const CourseSchema = z.object({
  is_course: z.boolean().describe("true only if the page is a single specific online course or course series"),
  title: z.string(),
  provider: z.string(),
  cost: z.string().describe('e.g. "Free", "Free to audit", "£39/month", or "unknown"'),
  length: z.string().describe('e.g. "6 weeks, 4h/week", or "unknown"'),
});

export async function extractCourse(pageText: string, url: string) {
  return parse(
    CourseSchema,
    'You extract an online course\'s title, provider, cost and length from its page. Use only facts on the page; write "unknown" for anything missing.',
    `Source URL: ${url}\n\nPage content:\n${pageText.slice(0, 8000)}`,
  );
}

// ---------- Research and People ----------

const QueryPlanSchema = z.object({ queries: z.array(z.string()) });

export async function planResearchQueries(profile: Profile): Promise<string[]> {
  const out = await parse(
    QueryPlanSchema,
    "You write web search queries that find undergraduate research opportunities: university summer research schemes (e.g. UCL, Imperial UROP, KCL), lab pages that say they take undergraduate students, and research internships open to undergraduates in London.",
    `Student profile:\n${describeProfile(profile)}\n\nReturn 4 search queries matched to the student's university and interests.`,
  );
  return out.queries.slice(0, 4);
}

const ResearchSchema = z.object({
  items: z.array(
    z.object({
      name: z.string(),
      organisation: z.string(),
      takes_undergraduates: z.enum(["yes", "no", "unknown"]),
      deadline: z.string().describe('YYYY-MM-DD, "rolling" or "unknown"'),
      summary: z.string().describe("one line on what the student would do"),
      why: z.string().describe("one line on why it fits this student"),
    }),
  ),
});

export async function extractResearch(pageText: string, url: string, profile: Profile, today: string) {
  const out = await parse(
    ResearchSchema,
    'You extract undergraduate research opportunities (schemes, lab placements, research internships) from a web page. Use only facts on the page. Set takes_undergraduates to "yes" only if the page says undergraduates can take part. Never guess a deadline. Return an empty list if the page has none. At most 3 items.',
    `Today is ${today}.\nSource URL: ${url}\n\nStudent profile:\n${describeProfile(profile)}\n\nPage content:\n${pageText.slice(0, 10_000)}`,
  );
  return out.items.slice(0, 3);
}

export async function planPeopleQueries(profile: Profile, topOpportunities: string[]): Promise<string[]> {
  const out = await parse(
    QueryPlanSchema,
    "You write web search queries that find PUBLIC pages naming people a student could learn from: firm early-careers or graduate recruitment team pages, university society speaker or committee pages, event speaker lists, and university staff pages. Never target LinkedIn or social media.",
    `Student profile:\n${describeProfile(profile)}\n\nTop target opportunities:\n${topOpportunities.join("\n") || "(none yet: use their target paths)"}\n\nReturn 4 search queries.`,
  );
  return out.queries.slice(0, 4);
}

const PeopleSchema = z.object({
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      organisation: z.string(),
      why: z.string().describe("one line on why this person is relevant to the student"),
      relevance: z.number().int().describe("0-100: how useful this person is to the student's target paths and opportunities"),
    }),
  ),
});

export async function extractPeople(pageText: string, url: string, profile: Profile) {
  const out = await parse(
    PeopleSchema,
    "You pick out up to 3 named people from a public web page who are most relevant to a student's career goals (e.g. early-careers recruiters, speakers, researchers, society leads). Use only names and roles stated on the page. Do not include email addresses, phone numbers or any other contact details. Return an empty list if no relevant named people appear.",
    `Source URL: ${url}\n\nStudent profile:\n${describeProfile(profile)}\n\nPage content:\n${pageText.slice(0, 10_000)}`,
  );
  return out.people.filter((p) => p.relevance >= 50).slice(0, 3);
}
