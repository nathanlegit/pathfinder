# Pathfinder

Pathfinder turns a student's profile into a ranked map of live spring weeks, insight days and internships. TinyFish Search finds openings, Fetch and Agent pull eligibility and deadlines from real careers pages, and Monitor watches tracked programmes for changes.

Built for the TinyFish x UCL AI Society Build Night.

## What it does

1. You fill in a profile: university, degree, year, target paths (SWE, quant, ML research…), interests, location and experience.
2. Claude turns the profile into 6 targeted search queries. They're shown in the UI.
3. TinyFish finds and reads the live pages. A live log streams every step.
4. Claude extracts each programme (firm, programme, type, eligibility, location, deadline, status) using only facts on the page, never guessed deadlines. It then scores each one 0–100 against your profile with a one-line reason.
5. You get a ranked table you can sort. Every row links to its source page.
6. **+ Track** copies an opportunity into an editable **Tracker** (status, priority, notes, deadlines, manual rows). It is saved in the browser and can be exported or imported as CSV. Deadlines within 14 days are highlighted.
7. **Watch** creates a TinyFish Monitor on a tracked programme's page. It runs every day, even after you close the tab. **Check now** runs it on demand and flags whether the page changed.

## TinyFish endpoints and what each does

| Endpoint | Used for |
| --- | --- |
| **Search** (`GET api.search.tinyfish.ai`) | Discovering live programme pages for each generated query (UK results). |
| **Fetch** (`POST api.fetch.tinyfish.ai`) | Reading candidate pages as clean markdown so Claude can extract the details. |
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
app/page.tsx               UI: profile form, live log, Opportunities and Tracker tabs
app/api/map/route.ts       Streams NDJSON progress + results for one run
app/api/monitor/route.ts   Create / check / delete TinyFish Monitors
lib/tinyfish.ts            Server-side TinyFish wrappers (search, fetch, agent, monitor)
lib/llm.ts                 Claude: query generation, extraction, fit scoring
lib/pipeline.ts            Orchestration: queries → search → fetch/agent → extract → score
lib/tracker.ts             Tracker storage (localStorage) and CSV import/export
```

API keys are only read on the server and are never sent to the browser.
