# PRD: Pathfinder (working name)

A web app that takes a student's profile and builds a personalised early-careers map: live spring weeks and internships ranked by fit, plus courses, research opportunities and people worth contacting, all gathered from the live web with TinyFish.

Built for the TinyFish x UCL AI Society Build Night. Hard deadline: submitted on TinyBounties by 20:15 UK time.

## 1. Constraints (read first)

- **Time box.** Build in phases. P0 must be working and screenshotted by 19:45. Do not start P1 until P0 runs end to end. Stop coding at 20:00 whatever state it's in.
- **TinyFish must do the core work.** Every external fact in the output (an opening, a deadline, a course, a contact) must come from a TinyFish call on the live web. The LLM only extracts, scores and explains. No canned or invented results.
- **Endpoints must be meaningful, not padded.** Scoring: 1 endpoint 50, 2 endpoints 100, 3+ endpoints 200. Target Search + Fetch + Agent + Monitor, each doing a distinct job.
- **No LinkedIn scraping.** It breaks LinkedIn's terms and is unreliable. Contacts come only from public pages (firm team pages, society and event speaker pages, university staff pages, public talks).
- **API keys stay server-side.** Never ship TinyFish or LLM keys to the browser or commit them. Use `.env` locally and platform secrets when deployed. Add `.env` to `.gitignore` before the first commit.
- **Readable over clever.** Plain functions, clear names, comments on anything non-obvious. One file per concern.
- **TinyFish API shapes:** read https://docs.tinyfish.ai before writing any client code. Do not guess endpoint paths, parameters or response formats.

## 2. Stack

- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui.
- TinyFish API (Search, Fetch, Agent, Monitor) via raw `fetch` in a small wrapper module (server-side only).
- Anthropic API (Claude) for extraction, scoring and summarising. Model and key from env vars.
- `unpdf` for CV text extraction.
- Tracker stored in browser localStorage, with CSV download/upload as backup.
- Deploy: public GitHub repo, then Vercel with env vars set in its dashboard (P1, only if time allows).

Layout:

```
app/page.tsx              # profile form + results tabs
app/api/map/route.ts      # streams NDJSON progress + results
app/api/monitor/route.ts  # create / check / delete monitors
lib/tinyfish.ts           # search(), fetchPages(), runAgent(), createMonitor(), runMonitor()
lib/llm.ts                # generateQueries(), extractOpportunity(), scoreFit()
lib/pipeline.ts           # profile -> queries -> results -> ranked list
lib/types.ts              # shared types
lib/tracker.ts            # localStorage + CSV helpers
components/               # ProfileForm, ProgressLog, OpportunitiesTable, TrackerTable
.env.example
README.md
```

## 3. User flow

1. User fills in a profile form: name (optional), university, degree, year of study, interests (free text), target paths (multi-select: SWE, ML/AI research, quant, product, consulting, finance, other), location preferences, and current experience (free text).
2. Optional: upload a CV PDF. Its text is extracted and merged into the profile.
3. User clicks **Map my path**.
4. App shows a progress log of what TinyFish is doing ("Searching spring weeks for quant, UK, 2027", "Reading janestreet.com/...").
5. Results appear in tabs: **Opportunities** (ranked), **Tracker**, **Events**, **Courses**, **Research**, **People**, **Roadmap**.
6. User adds any opportunity or event to the **Tracker** with one click, then edits it there like an application tracker (status, notes, own deadlines, manual rows).
7. User can set a Monitor on any tracked opportunity to be alerted when it opens or changes.

## 4. Features by phase

### P0: must ship (target 19:45). Search + Fetch = 100 pts

**P0.1 Profile input.** Streamlit form with the fields above. Paste-in experience text. No CV upload yet.

**P0.2 Query generation.** LLM turns the profile into 4 to 8 targeted search queries for spring weeks and first/second-year internships, for example "quant spring week 2027 UK first year". Show the queries in the UI so the judge can see the reasoning.

**P0.3 Opportunity discovery (TinyFish Search).** Run each query through TinyFish Search. Collect result URLs, dedupe by domain plus path, and keep the top 10 to 15 candidates.

**P0.4 Opportunity extraction (TinyFish Fetch).** Fetch each candidate URL to clean content. LLM extracts a structured record:

```
firm, programme_name, type (spring week | internship | insight day | other),
eligibility (year of study, degree), location, deadline (ISO date or "rolling" or "unknown"),
status (open | closed | opening soon | unknown), source_url
```

If a field isn't on the page, return "unknown". Never infer a deadline.

**P0.5 Fit scoring.** LLM scores each record 0 to 100 against the profile, with a one-line reason that cites concrete facts ("first-years eligible, closes 31 Oct, matches ML interest"). Ineligible (wrong year, closed) gets ranked down, not hidden.

**P0.6 Ranked table.** Sortable table: score, firm, programme, type, status, deadline, reason, source link. Every row must have a clickable source link.

Acceptance: from a typed profile, the app produces at least 8 real, linked opportunities, ranked, in under ~2 minutes. Take a screenshot and a short screen recording as soon as this works.

### P1: if P0 is done by 19:45. Tracker, then Agent + Monitor = 200 pts

**P1.0 Editable tracker (no TinyFish, build first: cheap and it's what makes the app reusable tomorrow).** An "Add to tracker" checkbox or button on each ranked row copies it into a Tracker tab. The Tracker is a `st.data_editor` table with columns:

```
firm, programme, type, deadline, my_status (Not started | Researching | Applying | Applied | Interview | Offer | Rejected | Not applying),
priority (High | Medium | Low), notes, source_url, monitored (bool), added_on
```

Users can edit any cell, add manual rows and delete rows. Save to `data/tracker.json` on every change and load it on startup. Add "Download CSV" and "Upload CSV" buttons, because Streamlit Cloud's filesystem resets on redeploy and CSV is the user's backup. Sort by deadline by default and highlight anything due within 14 days.

**P1.1 Agent fallback for hard pages (TinyFish Agent).** When Fetch returns too little content, or the page is a JS-heavy careers portal (Workday, Oracle, Greenhouse search pages), run TinyFish Agent with a plain-English goal, for example "Find the spring week or first-year programme on this careers site and return its name, eligibility, deadline and status." Mark these rows "via Agent" in the table.

**P1.2 Monitors (TinyFish Monitor).** A "Watch" button per tracked opportunity (sets `monitored` to true) creates a TinyFish Monitor on its source URL to alert on status or deadline changes. Show the active monitors in the sidebar. This is the stated bonus: it keeps working after tonight.

**P1.3 CV upload.** PDF upload, text extracted with `pypdf`, appended to the profile before query generation.

### P2: only if P1 is done. Extra tabs, Search + Fetch + Agent reused

**P2.0 Events from Luma (TinyFish Search + Agent).** Find upcoming London events relevant to the profile (AI, careers fairs, firm insight evenings, hackathons). Use TinyFish Search with queries such as `site:lu.ma London AI event`. Luma pages render with JavaScript, so if Fetch returns too little, use Agent with a goal like "Return this event's title, date, time, venue, organiser and registration link." Show an Events tab with: title, date, venue, organiser, why it's relevant, and link. Only future events. Each event can be added to the tracker with type "event". Never register for anything automatically.

**P2.1 Courses.** Search for 3 to 5 online courses that fill the gap between the profile and the top-ranked opportunities. Fetch each to confirm title, provider, cost and length.

**P2.2 Research.** Search UCL and London lab pages and undergraduate research schemes matching the interests. Fetch to confirm they take undergraduates.

**P2.3 People.** Search public pages only (firm early-careers team pages, society speaker lists, event pages, staff pages) for people relevant to the top opportunities. Show name, role, organisation, why they're relevant and the source page. No personal contact details, no LinkedIn scraping.

**P2.4 Roadmap.** A simple timeline (Streamlit chart or table) of the top opportunities' deadlines over the next 6 months, with courses slotted before relevant deadlines.

### Out of scope tonight

Accounts and login (the tracker is single-user, stored locally), saved profiles, emailing contacts, auto-registering for events, LinkedIn anything, paid course purchasing.

## 5. Error handling

- Every TinyFish and LLM call is wrapped with a timeout and try/except. A failed URL becomes a logged skip, never a crash.
- Run Fetch calls concurrently (thread pool, small limit such as 5) so the whole run fits in the demo.
- Cache results in `st.session_state` so re-sorting doesn't re-run the pipeline.
- If no TinyFish key is set, show a clear error on startup instead of failing mid-run.

## 6. Submission checklist (from 20:00)

- [ ] Public GitHub repo with README: what it does, which TinyFish endpoints it uses and for what, how to run it (`.env.example`).
- [ ] Screenshot of the ranked table with real source links; screen recording of a full run.
- [ ] Optional: deployed Streamlit link, or a LinkedIn/X post with the recording.
- [ ] Two-sentence description, for example: "Pathfinder turns a student's profile into a ranked map of live spring weeks and internships. TinyFish Search discovers openings, Fetch and Agent extract eligibility and deadlines from real careers pages, and Monitor watches them for changes."
- [ ] Submitted on TinyBounties with the feedback questions answered, before 20:15.

## 7. Instructions for Claude Code

Work phase by phase. After P0, stop and confirm it runs before starting P1. Read the TinyFish docs before writing `tinyfish_client.py`. Keep functions small and explicit, and keep secrets out of the repo.