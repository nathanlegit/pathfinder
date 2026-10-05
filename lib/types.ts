// Shared types used by the API routes and the UI.

export const TARGET_PATHS = [
  "SWE",
  "ML/AI research",
  "Quant",
  "Product",
  "Consulting",
  "Finance",
  "Other",
] as const;

export type Profile = {
  name?: string;
  university: string;
  degree: string;
  yearOfStudy: string;
  interests: string;
  targetPaths: string[];
  locations: string;
  experience: string;
  cvText?: string;
};

export type OpportunityType = "spring week" | "internship" | "insight day" | "other";
export type OpportunityStatus = "open" | "closed" | "opening soon" | "unknown";

export type Opportunity = {
  firm: string;
  programme_name: string;
  type: OpportunityType;
  eligibility: string;
  location: string;
  deadline: string; // ISO date, "rolling" or "unknown"
  status: OpportunityStatus;
  source_url: string;
  score: number; // 0-100 fit
  reason: string;
  via: "fetch" | "agent";
};

export type LumaEvent = {
  title: string;
  date: string; // ISO YYYY-MM-DD
  time: string;
  venue: string;
  organiser: string;
  url: string;
  score: number; // 0-100 relevance to the profile
  why: string;
  via: "fetch" | "agent";
};

export type Course = {
  title: string;
  provider: string;
  cost: string;
  length: string;
  url: string;
  fills_gap: string; // which gap it closes, tied to a target opportunity
};

// One NDJSON line streamed from /api/map to the browser.
export type ProgressEvent =
  | { type: "log"; message: string }
  | { type: "queries"; queries: string[] }
  | { type: "results"; opportunities: Opportunity[] }
  | { type: "events"; events: LumaEvent[] }
  | { type: "courses"; courses: Course[] }
  | { type: "error"; message: string }
  | { type: "done" };

export const MY_STATUSES = [
  "Not started",
  "Researching",
  "Applying",
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Not applying",
] as const;

export const PRIORITIES = ["High", "Medium", "Low"] as const;

export type TrackerRow = {
  id: string;
  firm: string;
  programme: string;
  type: string;
  deadline: string;
  my_status: (typeof MY_STATUSES)[number];
  priority: (typeof PRIORITIES)[number];
  notes: string;
  source_url: string;
  monitored: boolean;
  monitor_id?: string;
  monitor_baseline_hash?: string;
  monitor_last_check?: string;
  monitor_changed?: boolean;
  added_on: string;
};
