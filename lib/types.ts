// Shared types used by the API routes and the UI.

// Every career path we offer in onboarding, grouped by sector. Claude also suggests
// paths tailored to the profile, and users can type their own.
export const CAREER_PATHS: { sector: string; paths: string[] }[] = [
  { sector: "Creative & culture", paths: ["Arts & museums", "Film & TV", "Music", "Theatre & performing arts", "Publishing", "Games"] },
  { sector: "Media & comms", paths: ["Journalism", "Marketing & advertising", "PR & communications", "Social media & content"] },
  { sector: "Design", paths: ["Graphic design", "UX & product design", "Fashion", "Architecture", "Interior design"] },
  { sector: "Law & policy", paths: ["Law (solicitor)", "Law (barrister)", "Civil service", "Policy & think tanks", "Politics", "International relations"] },
  { sector: "People & society", paths: ["Teaching & education", "Charity & NGOs", "Social work", "Psychology", "HR & recruitment"] },
  { sector: "Health & science", paths: ["Medicine & healthcare", "Pharma & biotech", "Lab research", "Environment & sustainability", "Public health"] },
  { sector: "Tech", paths: ["Software engineering", "Data & AI", "Cybersecurity", "Product management", "Tech startups"] },
  { sector: "Business & finance", paths: ["Consulting", "Investment banking", "Asset management", "Quant & trading", "Accounting", "Insurance", "Entrepreneurship"] },
  { sector: "Engineering & built world", paths: ["Civil engineering", "Mechanical & aerospace", "Electrical & electronics", "Energy", "Property & construction"] },
  { sector: "Other paths", paths: ["Hospitality & events", "Sport", "Retail & luxury", "Logistics & supply chain", "Academia & research"] },
];

export type Profile = {
  name?: string;
  university: string;
  degree: string;
  yearOfStudy: string;
  interests: string;
  targetPaths: string[];
  locations: string;
  experience: string;
  motivations: string[];
  cvText?: string;
  cvName?: string;
};

export const MOTIVATIONS = [
  "Building things",
  "Cracking hard puzzles",
  "Helping people",
  "Fixing the climate",
  "Money, honestly",
  "Making creative stuff",
  "Research and discovery",
  "Leading a team",
  "Startup chaos",
  "Public good",
  "Seeing the world",
  "Stability and balance",
] as const;

export const OPPORTUNITY_TYPES = [
  "spring week",
  "insight day",
  "internship",
  "work experience",
  "placement",
  "graduate scheme",
  "apprenticeship",
  "fellowship",
  "residency",
  "competition",
  "volunteering",
  "other",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];
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

export type ResearchOpportunity = {
  name: string;
  organisation: string;
  takes_undergraduates: "yes" | "unknown";
  deadline: string;
  summary: string;
  why: string;
  url: string;
};

// A person found on a public page. No contact details are collected.
export type Person = {
  name: string;
  role: string;
  organisation: string;
  why: string;
  url: string;
};

// Pipeline stages shown in the loading screen's stepper.
export type Stage = "plan" | "search" | "read" | "match" | "done";
export type ActivityKind = "search" | "read" | "found" | "skip" | "agent" | "info";

// One NDJSON line streamed from the API routes to the browser.
export type ProgressEvent =
  | { type: "stage"; stage: Stage }
  | { type: "activity"; kind: ActivityKind; text: string; host?: string; detail?: string }
  | { type: "stats"; searched: number; read: number; found: number }
  | { type: "queries"; queries: string[] }
  | { type: "results"; opportunities: Opportunity[] }
  | { type: "events"; events: LumaEvent[] }
  | { type: "courses"; courses: Course[] }
  | { type: "research"; research: ResearchOpportunity[] }
  | { type: "people"; people: Person[] }
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
