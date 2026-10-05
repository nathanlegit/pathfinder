# Pathfinder

Pathfinder turns a student's profile into a ranked map of live spring weeks, insight days and internships. TinyFish Search finds openings, Fetch and Agent pull eligibility and deadlines from real careers pages, and Monitor watches tracked programmes for changes.

Built for the TinyFish x UCL AI Society Build Night.

## What it does

Works for every career path: onboarding asks Claude to suggest paths that fit your degree, interests and motivations (an art history student gets museums and publishing, not quant), and every search prompt uses the sector's own vocabulary (residencies, vacation schemes, work experience, fellowships…). After onboarding, matches, events and research load in parallel, with courses and people following as soon as the first matches land; a loading screen shows live progress until the first results appear (~25s).

Three pages: a landing page (`/`), a 3-step onboarding (`/onboarding`: CV, what drives you, preferences) and the app (`/matches`: Matches, Events, Courses, Research, People, Saved, Deadlines). Profile, results and the tracker are saved in your browser.

1. You fill in a profile: university, degree, year, target paths (SWE, quant, ML research…), interests, location and experience.
2. Claude turns the profile into 6 targeted search queries. They're shown in the UI.
3. TinyFish finds and reads the live pages. A live log streams every step.
4. Claude extracts each programme (firm, programme, type, eligibility, location, deadline, status) using only facts on the page, never guessed deadlines. It then scores each one 0–100 against your profile with a one-line reason.
5. You get a ranked table you can sort. Every row links to its source page.
6. **+ Track** copies an opportunity into an editable **Tracker** (status, priority, notes, deadlines, manual rows). It is saved in the browser and can be exported or imported as CSV. Deadlines within 14 days are highlighted.
7. **Events** finds upcoming London events on Luma (hackathons, careers evenings, AI meetups) ranked by relevance, each with a link to register yourself and a **+ Track** button. Pathfinder never registers for you.
8. **Courses** names 3 concrete skill gaps between you and your top opportunities, then finds and confirms real online courses (title, provider, cost, length) that close them.
9. **Research** finds university research schemes and labs (e.g. UROP programmes) and flags whether each page confirms it takes undergraduates.
10. **People** finds people worth learning from (early-careers teams, event speakers, researchers) on public pages only. LinkedIn and social networks are excluded, and no contact details are collected.
11. **Roadmap** lays the next 6 months out on a timeline: real deadlines, events, and courses scheduled to finish before your first deadline.
12. **Watch** creates a TinyFish Monitor on a tracked programme's page. It runs every day, even after you close the tab. **Check now** runs it on demand and flags whether the page changed.

## TinyFish endpoints and what each does

| Endpoint | Used for |
| --- | --- |
| **Search** (`GET api.search.tinyfish.ai`) | Discovering live programme pages for each generated query (UK results), and Luma event pages (`include_domains=lu.ma,luma.com`). |
| **Fetch** (`POST api.fetch.tinyfish.ai`) | Reading candidate pages as clean markdown so Claude can extract the details; reading Luma calendars with `links: true` to follow their upcoming event links. |
| **Agent** (`POST agent.tinyfish.ai/v1/automation/run-async`) | Fallback for pages Fetch can't read: JavaScript-heavy careers portals (Workday, Greenhouse, Lever…), near-empty pages, or Fetch errors. Up to 3 runs per map, started early so they overlap with the rest. Rows found this way are marked "via Agent". |
| **Monitor** (`POST agent.tinyfish.ai/v1/monitors`) | Daily page monitors on tracked opportunities, with run-now checks from the Tracker. |

Every opportunity in the output comes from a page TinyFish retrieved. The LLM only plans queries, extracts, scores and explains. No LinkedIn scraping; only public pages are used.

## Run it

```bash
cp .env.example .env    # add TINYFISH_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev             # http://localhost:3000
```

Optional: `ANTHROPIC_MODEL` overrides the Claude model (default `claude-opus-5-5`).

## Code layout

```
app/page.tsx               Landing page
app/onboarding/page.tsx    3-step profile setup (CV upload, motivations, preferences)
app/matches/page.tsx       The app: matches feed + Events / Courses / Research / People / Saved / Deadlines
lib/store.ts               Profile + last results in localStorage
app/api/map/route.ts       Streams NDJSON progress + results for one run
app/api/events/route.ts    Streams NDJSON progress + upcoming Luma events
app/api/courses/route.ts   Streams NDJSON progress + gap-closing courses
app/api/research/route.ts  Streams NDJSON progress + undergraduate research opportunities
app/api/people/route.ts    Streams NDJSON progress + people from public pages
app/api/monitor/route.ts   Create / check / delete TinyFish Monitors
lib/tinyfish.ts            Server-side TinyFish wrappers (search, fetch, agent, monitor)
lib/llm.ts                 Claude: query generation, extraction, fit scoring
lib/courses.ts             Courses: gaps → search → fetch to confirm details
lib/discover.ts            Research and People: plan queries → search → fetch → extract
lib/events.ts              Luma events: search → calendars → event pages → extract → rate
lib/pipeline.ts            Orchestration: queries → search → fetch/agent → extract → score
lib/tracker.ts             Tracker storage (localStorage) and CSV import/export
```

API keys are only read on the server and are never sent to the browser.
