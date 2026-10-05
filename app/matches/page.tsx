"use client";

// The app: matches feed plus Events, Courses, Research, People, Saved (tracker) and Deadlines (roadmap).
// All web work happens in the API routes (TinyFish + Claude); this page streams their NDJSON progress.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ProgressLog } from "@/components/ProgressLog";
import { MatchCard, deadlineLabel } from "@/components/MatchCard";
import { EventsTable } from "@/components/EventsTable";
import { CoursesList } from "@/components/CoursesList";
import { FindPanel } from "@/components/FindPanel";
import { TrackerTable } from "@/components/TrackerTable";
import { Roadmap } from "@/components/Roadmap";
import { EMPTY_PROFILE, EMPTY_RESULTS, loadProfile, loadResults, saveResults, type Results } from "@/lib/store";
import { daysUntil, emptyRow, loadTracker, rowFromOpportunity, saveTracker, trackerKey } from "@/lib/tracker";
import type { LumaEvent, Opportunity, Profile, ProgressEvent, ResearchOpportunity, TrackerRow } from "@/lib/types";

type View = "matches" | "events" | "courses" | "research" | "people" | "saved" | "deadlines";

const VIEWS: { id: View; label: string }[] = [
  { id: "matches", label: "Matches" },
  { id: "events", label: "Events" },
  { id: "courses", label: "Courses" },
  { id: "research", label: "Research" },
  { id: "people", label: "People" },
  { id: "saved", label: "Saved" },
  { id: "deadlines", label: "Deadlines" },
];

const TYPE_FILTERS = [
  { id: "all", label: "All" },
  { id: "spring week", label: "Spring weeks" },
  { id: "internship", label: "Internships" },
  { id: "insight day", label: "Insight days" },
  { id: "other", label: "Other" },
];

type StreamPath = "/api/map" | "/api/events" | "/api/courses" | "/api/research" | "/api/people";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
}

export default function Matches() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [results, setResults] = useState<Results>(EMPTY_RESULTS);
  const [tracker, setTracker] = useState<TrackerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("matches");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Load saved state once in the browser; start a run if onboarding sent us here with ?run=1.
  useEffect(() => {
    const p = loadProfile();
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage only exists after mount */
    setProfile(p);
    setResults(loadResults());
    setTracker(loadTracker());
    const fromHash = window.location.hash.slice(1) as View;
    if (VIEWS.some((v) => v.id === fromHash)) setView(fromHash);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (new URLSearchParams(window.location.search).get("run") === "1" && p.university) {
      window.history.replaceState(null, "", "/matches");
      runStream("/api/map", p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) saveTracker(tracker);
  }, [tracker, loaded]);
  useEffect(() => {
    if (loaded) saveResults(results);
  }, [results, loaded]);

  const hasProfile = !!profile.university;
  const trackedKeys = useMemo(() => new Set(tracker.map((r) => trackerKey(r.source_url, r.programme))), [tracker]);
  const watched = tracker.filter((r) => r.monitored);

  function go(v: View) {
    setView(v);
    window.history.replaceState(null, "", `#${v}`);
    window.scrollTo({ top: 0 });
  }

  // ---------- Streaming runs ----------

  async function runStream(path: StreamPath, body: object = profile) {
    setRunning(true);
    setLog([]);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ProgressEvent;
          if (e.type === "log") setLog((l) => [...l, e.message]);
          else if (e.type === "queries") setResults((r) => ({ ...r, queries: e.queries }));
          else if (e.type === "results") setResults((r) => ({ ...r, opportunities: e.opportunities, mappedAt: new Date().toISOString() }));
          else if (e.type === "events") setResults((r) => ({ ...r, events: e.events }));
          else if (e.type === "courses") setResults((r) => ({ ...r, courses: e.courses }));
          else if (e.type === "research") setResults((r) => ({ ...r, research: e.research }));
          else if (e.type === "people") setResults((r) => ({ ...r, people: e.people }));
          else if (e.type === "error") setError(e.message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const topOpportunities = () =>
    results.opportunities.slice(0, 5).map((o) => `${o.firm} ${o.programme_name} (${o.eligibility})`);

  // ---------- Tracker + Monitor ----------

  const patchRow = (id: string, patch: Partial<TrackerRow>) =>
    setTracker((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveOpportunity = (o: Opportunity) => setTracker((rows) => [...rows, rowFromOpportunity(o)]);
  const saveEvent = (e: LumaEvent) =>
    setTracker((rows) => [
      ...rows,
      {
        ...emptyRow(),
        firm: e.organiser,
        programme: e.title,
        type: "event",
        deadline: e.date,
        notes: [e.time, e.venue].filter((x) => x && x !== "unknown").join(" · "),
        source_url: e.url,
      },
    ]);
  const saveResearch = (r: ResearchOpportunity) =>
    setTracker((rows) => [
      ...rows,
      { ...emptyRow(), firm: r.organisation, programme: r.name, type: "research", deadline: r.deadline, notes: r.summary, source_url: r.url },
    ]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyIds((s) => new Set(s).add(id));
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
  }

  async function callMonitor(method: "POST" | "DELETE", body: object) {
    const res = await fetch("/api/monitor", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `Monitor request failed (${res.status})`);
    return data;
  }

  const watchRow = (r: TrackerRow) =>
    withBusy(r.id, async () => {
      const data = await callMonitor("POST", { url: r.source_url, name: `${r.firm} ${r.programme}` });
      patchRow(r.id, { monitored: true, monitor_id: data.id, monitor_baseline_hash: data.hash ?? undefined });
    });

  const checkRow = (r: TrackerRow) =>
    withBusy(r.id, async () => {
      if (!r.monitor_id) return;
      const data = await callMonitor("POST", { action: "check", id: r.monitor_id });
      patchRow(r.id, {
        monitor_changed: !!r.monitor_baseline_hash && !!data.hash && data.hash !== r.monitor_baseline_hash,
        monitor_last_check: new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }),
      });
    });

  const unwatchRow = (r: TrackerRow) =>
    withBusy(r.id, async () => {
      if (r.monitor_id) await callMonitor("DELETE", { id: r.monitor_id });
      patchRow(r.id, { monitored: false, monitor_id: undefined, monitor_baseline_hash: undefined, monitor_changed: undefined, monitor_last_check: undefined });
    });

  // ---------- Derived ----------

  const oppKey = (o: Opportunity) => o.source_url + "|" + o.programme_name;
  const feed = results.opportunities.filter((o) => {
    if (hidden.has(oppKey(o))) return false;
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [o.firm, o.programme_name, o.reason, o.location].some((f) => f.toLowerCase().includes(q));
  });

  // Deadlines in the next 7 days across saved rows and decent matches, for the sticker.
  const dueSoon = useMemo(() => {
    const items = new Map<string, { label: string; days: number }>();
    for (const r of tracker) {
      const d = daysUntil(r.deadline);
      if (d !== null && d >= 0 && d <= 7) items.set(r.firm + r.programme, { label: `${r.firm} ${r.programme}`, days: d });
    }
    for (const o of results.opportunities) {
      const d = daysUntil(o.deadline);
      if (o.score >= 45 && d !== null && d >= 0 && d <= 7) items.set(o.firm + o.programme_name, { label: `${o.firm} ${o.programme_name}`, days: d });
    }
    return [...items.values()].sort((a, b) => a.days - b.days);
  }, [tracker, results.opportunities]);

  const name = profile.name?.trim() || "there";
  const heroes: Record<View, { eyebrow: string; title: React.ReactNode }> = {
    matches: {
      eyebrow: results.mappedAt ? `Live from the web · ${new Date(results.mappedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Live from the web",
      title: (
        <>
          {greeting()}, {name}. <span className="hl">{feed.length} live</span> picks.
        </>
      ),
    },
    events: { eyebrow: "Upcoming in London", title: <>Events worth leaving the <span className="hl">library</span> for.</> },
    courses: { eyebrow: "Close the gap", title: <>Courses that get you <span className="hl">ready</span>.</> },
    research: { eyebrow: "Research", title: <>Get yourself into a <span className="hl">lab</span>.</> },
    people: { eyebrow: "People", title: <>Who to <span className="hl">learn from</span>.</> },
    saved: { eyebrow: "Saved", title: <>Your <span className="hl">shortlist</span>.</> },
    deadlines: { eyebrow: "Deadlines", title: <>The next six <span className="hl">months</span>.</> },
  };

  // ---------- Render ----------

  if (loaded && !hasProfile) {
    return (
      <div className="min-h-screen">
        <AppHeader view={view} go={go} search={search} setSearch={setSearch} initial="?" />
        <main className="mx-auto max-w-[1280px] px-6 py-24">
          <div className="card max-w-2xl p-10">
            <div className="eyebrow tracking-[0.16em] text-blue">Two minutes</div>
            <h1 className="mt-3 text-[clamp(36px,5vw,60px)] leading-[0.95] font-black tracking-[-0.05em]">
              Tell us about <span className="hl">you</span> first.
            </h1>
            <p className="mt-4 text-lg text-body">Your profile drives every search. It stays in this browser.</p>
            <Link href="/onboarding" className="btn btn-blue press mt-8 px-6 py-4 text-base shadow-[4px_4px_0_#111]">
              Set up my profile →
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28 md:pb-0">
      <AppHeader view={view} go={go} search={search} setSearch={setSearch} initial={(profile.name?.trim()[0] ?? "Y").toUpperCase()} />

      <div className="mx-auto max-w-[1280px] px-6 pt-12 pb-20">
        {/* Hero row */}
        <div className="mb-9 flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-[1_1_480px]">
            <div className="eyebrow tracking-[0.16em] text-blue">{heroes[view].eyebrow}</div>
            <h1 className="mt-2.5 text-[clamp(38px,5vw,68px)] leading-[0.95] font-black tracking-[-0.05em]">{heroes[view].title}</h1>
          </div>
          <button
            type="button"
            onClick={() => go("deadlines")}
            className="flex rotate-[1.5deg] cursor-pointer items-center gap-3 border-2 border-ink bg-blue px-4.5 py-3.5 text-left text-cream shadow-[4px_4px_0_#111]"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FBF5E9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2M9 2h6" />
            </svg>
            <div>
              <div className="font-extrabold">
                {dueSoon.length === 0 ? "No deadlines this week" : `${dueSoon.length} deadline${dueSoon.length > 1 ? "s" : ""} this week`}
              </div>
              <div className="max-w-[260px] truncate text-[13px] opacity-90">
                {dueSoon[0] ? `${dueSoon[0].label}: ${dueSoon[0].days === 0 ? "today" : `${dueSoon[0].days}d`}` : "We'll flag them here"}
              </div>
            </div>
          </button>
        </div>

        {error && (
          <div className="mb-8 border-2 border-ink bg-white px-5 py-4 font-bold shadow-[4px_4px_0_#111]">
            <span className="eyebrow mr-2 text-blue">Heads up</span>
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-8">
          {/* Aside */}
          <aside className="flex max-w-full min-w-0 flex-[1_1_260px] flex-col gap-6 max-md:order-2">
            {view === "matches" && (
              <div className="card p-5.5">
                <div className="eyebrow text-[11px] text-muted">Type</div>
                <div className="mt-3 mb-6 flex flex-wrap gap-2">
                  {TYPE_FILTERS.map((t) => {
                    const on = typeFilter === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTypeFilter(t.id)}
                        className={`min-h-10 cursor-pointer border-2 border-ink px-3 py-2 text-[13px] font-bold ${on ? "bg-blue text-cream shadow-[3px_3px_0_#111]" : "bg-cream"}`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div className="eyebrow text-[11px] text-muted">Driven by</div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(profile.motivations.length ? profile.motivations : ["Not set yet"]).map((m) => (
                    <span key={m} className="chip bg-sky">
                      {m}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-2">
                  <button type="button" disabled={running} onClick={() => runStream("/api/map")} className="btn btn-ink press flex-1">
                    {running ? "Hunting…" : results.opportunities.length ? "Refresh matches" : "Find my matches"}
                  </button>
                  <Link href="/onboarding" className="btn btn-cream press">
                    Edit
                  </Link>
                </div>
              </div>
            )}

            <ProgressLog lines={log} queries={results.queries} running={running} />

            <div className="card p-5">
              <div className="eyebrow text-[11px] text-muted">Watching ({watched.length})</div>
              {watched.length === 0 ? (
                <p className="mt-2 text-sm leading-normal text-body">
                  Save a pick, then hit <b>Watch</b> in Saved. TinyFish Monitor re-reads the page daily, even with this tab closed.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {watched.map((r) => (
                    <li key={r.id} className="flex items-start justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-extrabold">{r.firm}</div>
                        <div className="truncate text-muted">{r.programme}</div>
                      </div>
                      {r.monitor_changed && <span className="chip shrink-0 bg-blue text-cream">changed</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>

          {/* Main view */}
          <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
            {view === "matches" &&
              (feed.length === 0 ? (
                <div className="border-2 border-dashed border-ink bg-sand px-6 py-16 text-center">
                  <div className="text-2xl font-black tracking-[-0.02em]">
                    {running ? "TinyFish is reading careers pages…" : results.opportunities.length ? "Nothing matches that filter." : "No matches yet."}
                  </div>
                  <p className="mt-2 text-body">
                    {running ? "First picks usually land in under a minute. Watch the log on the left." : "Hit “Find my matches” to search the live web."}
                  </p>
                </div>
              ) : (
                feed.map((o, i) => (
                  <MatchCard
                    key={oppKey(o)}
                    o={o}
                    hero={i === 0}
                    saved={trackedKeys.has(trackerKey(o.source_url, o.programme_name))}
                    onSave={() => saveOpportunity(o)}
                    onHide={() => setHidden((h) => new Set(h).add(oppKey(o)))}
                  />
                ))
              ))}

            {view === "events" && (
              <FindPanel
                label={results.events.length ? "Refresh events" : "Find London events"}
                hint="Upcoming Luma events matched to you. We never register on your behalf."
                running={running}
                canRun={hasProfile}
                onFind={() => runStream("/api/events")}
                empty={results.events.length === 0}
                emptyText={running ? "Reading Luma calendars…" : "No events yet. Hit the button to search Luma."}
              >
                <EventsTable events={results.events} onAdd={saveEvent} trackedKeys={trackedKeys} />
              </FindPanel>
            )}

            {view === "courses" && (
              <FindPanel
                label={results.courses.length ? "Refresh courses" : "Find courses to close my gaps"}
                hint={results.opportunities.length ? "Matched to the gaps between you and your top 5 picks." : "Tip: find your matches first so courses target them."}
                running={running}
                canRun={hasProfile}
                onFind={() => runStream("/api/courses", { profile, topOpportunities: topOpportunities() })}
                empty={results.courses.length === 0}
                emptyText={running ? "Spotting your gaps…" : "No courses yet."}
              >
                <CoursesList courses={results.courses} />
              </FindPanel>
            )}

            {view === "research" && (
              <FindPanel
                label={results.research.length ? "Refresh research" : "Find research opportunities"}
                hint="University schemes and labs that take undergraduates."
                running={running}
                canRun={hasProfile}
                onFind={() => runStream("/api/research")}
                empty={results.research.length === 0}
                emptyText={running ? "Reading lab and scheme pages…" : "No research picks yet."}
              >
                {results.research.map((r, i) => {
                  const saved = trackedKeys.has(trackerKey(r.url, r.name));
                  return (
                    <article key={i} className="card p-6">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`chip font-extrabold ${r.takes_undergraduates === "yes" ? "bg-blue text-cream" : "bg-cream"}`}>
                          {r.takes_undergraduates === "yes" ? "Takes undergrads" : "Check eligibility"}
                        </span>
                        <span className="eyebrow text-[11px]">{r.organisation}</span>
                        <span className="ml-auto border-2 border-ink bg-cream px-2.5 py-1 text-[13px] font-extrabold">{deadlineLabel(r.deadline)}</span>
                      </div>
                      <h3 className="mt-4 text-[24px] leading-[1.05] font-black tracking-[-0.03em]">{r.name}</h3>
                      <p className="mt-2 text-[15px] text-body">{r.summary}</p>
                      <div className="mt-4 border-2 border-ink bg-cream px-4 py-3 text-[15px]">
                        <b>Why you:</b> {r.why}
                      </div>
                      <div className="mt-5 flex flex-wrap gap-3">
                        <a href={r.url} target="_blank" rel="noreferrer" className="btn btn-ink press">
                          Read more →
                        </a>
                        <button type="button" disabled={saved} onClick={() => saveResearch(r)} className="btn btn-cream press disabled:opacity-100">
                          {saved ? "★ Saved" : "☆ Save"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </FindPanel>
            )}

            {view === "people" && (
              <FindPanel
                label={results.people.length ? "Refresh people" : "Find people to learn from"}
                hint="Public pages only: team pages, speaker lists, staff pages. No LinkedIn, no contact details."
                running={running}
                canRun={hasProfile}
                onFind={() => runStream("/api/people", { profile, topOpportunities: topOpportunities() })}
                empty={results.people.length === 0}
                emptyText={running ? "Reading public team and speaker pages…" : "No people yet."}
              >
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {results.people.map((p, i) => (
                    <article key={i} className="card flex flex-col p-6">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink bg-sky text-lg font-black shadow-[3px_3px_0_#111]">
                          {p.name.trim()[0]?.toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-lg font-black tracking-[-0.02em]">{p.name}</div>
                          <div className="eyebrow truncate text-[10px] text-muted">{p.organisation}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-sm font-semibold">{p.role}</div>
                      <p className="mt-3 flex-1 border-2 border-ink bg-cream px-4 py-3 text-[15px]">{p.why}</p>
                      <a href={p.url} target="_blank" rel="noreferrer" className="mt-4 text-sm font-bold">
                        Source: {new URL(p.url).hostname.replace(/^www\./, "")} ↗
                      </a>
                    </article>
                  ))}
                </div>
              </FindPanel>
            )}

            {view === "saved" && (
              <TrackerTable rows={tracker} onChange={setTracker} onWatch={watchRow} onCheck={checkRow} onUnwatch={unwatchRow} busyIds={busyIds} />
            )}

            {view === "deadlines" && (
              <Roadmap opportunities={results.opportunities} tracker={tracker} events={results.events} courses={results.courses} />
            )}
          </section>
        </div>
      </div>

      <MobileTabBar view={view} go={go} />
    </div>
  );
}

function AppHeader({
  view,
  go,
  search,
  setSearch,
  initial,
}: {
  view: View;
  go: (v: View) => void;
  search: string;
  setSearch: (s: string) => void;
  initial: string;
}) {
  return (
    <header className="border-b-2 border-ink bg-cream">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-4">
        <Logo />
        <nav className="eyebrow -mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 tracking-[0.1em] max-md:order-3 max-md:w-full">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => go(v.id)}
              className={`shrink-0 cursor-pointer px-3.5 py-2.5 whitespace-nowrap uppercase ${view === v.id ? "bg-ink text-cream" : "text-ink hover:bg-sand"}`}
            >
              {v.label}
            </button>
          ))}
          <Link href="/onboarding" className="shrink-0 px-3.5 py-2.5 whitespace-nowrap text-ink no-underline hover:bg-sand hover:text-ink">
            My profile
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <label htmlFor="search" className="sr-only">
            Search matches
          </label>
          <input
            id="search"
            type="search"
            placeholder="Search roles, orgs…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (view !== "matches") go("matches");
            }}
            className="field w-[200px] max-w-[45vw] py-2.5"
          />
          <Link
            href="/onboarding"
            aria-label="Your profile"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-2 border-ink bg-sky font-black text-ink no-underline shadow-[3px_3px_0_#111] hover:text-ink"
          >
            {initial}
          </Link>
        </div>
      </div>
    </header>
  );
}

// Bottom tab bar from the mobile design, shown under the md breakpoint.
function MobileTabBar({ view, go }: { view: View; go: (v: View) => void }) {
  const tabs: { id: View | "me"; label: string; icon: React.ReactNode }[] = [
    { id: "matches", label: "Picks", icon: <><rect x="4" y="3" width="16" height="18" /><path d="M8 8h8M8 12h8M8 16h5" /></> },
    { id: "saved", label: "Saved", icon: <path d="M6 3h12v18l-6-4-6 4z" /> },
    { id: "deadlines", label: "Deadlines", icon: <><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></> },
    { id: "me", label: "Me", icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t-2 border-ink bg-white px-2 pt-2 pb-6 md:hidden">
      {tabs.map((t) => {
        const active = t.id === view;
        const inner = (
          <>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {t.icon}
            </svg>
            {t.label}
          </>
        );
        const cls = `flex flex-col items-center gap-1 py-2 text-[11px] no-underline ${active ? "font-extrabold text-blue" : "font-bold text-ink"}`;
        return t.id === "me" ? (
          <Link key={t.id} href="/onboarding" className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={t.id} type="button" onClick={() => go(t.id as View)} className={`${cls} cursor-pointer`}>
            {inner}
          </button>
        );
      })}
    </nav>
  );
}
