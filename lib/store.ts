// Browser persistence for the profile and the last results, so moving between
// onboarding and the matches feed never loses a run. Wrapped in try/catch because
// storage can be blocked (private windows, previews).

import type { Course, LumaEvent, Opportunity, Person, Profile, ResearchOpportunity } from "./types";

const PROFILE_KEY = "pathfinder.profile.v1";
const RESULTS_KEY = "pathfinder.results.v1";

export const EMPTY_PROFILE: Profile = {
  university: "",
  degree: "",
  yearOfStudy: "1st year",
  interests: "",
  targetPaths: [],
  locations: "London, UK",
  experience: "",
  motivations: [],
};

export type Results = {
  opportunities: Opportunity[];
  events: LumaEvent[];
  courses: Course[];
  research: ResearchOpportunity[];
  people: Person[];
  queries: string[];
  mappedAt?: string;
};

export const EMPTY_RESULTS: Results = { opportunities: [], events: [], courses: [], research: [], people: [], queries: [] };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore: storage full or blocked
  }
}

export const loadProfile = () => read<Profile>(PROFILE_KEY, EMPTY_PROFILE);
export const saveProfile = (p: Profile) => write(PROFILE_KEY, p);
export const loadResults = () => read<Results>(RESULTS_KEY, EMPTY_RESULTS);
export const saveResults = (r: Results) => write(RESULTS_KEY, r);
