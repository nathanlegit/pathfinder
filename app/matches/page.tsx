"use client";

// The app: matches feed plus Events, Courses, Research, People, Saved (tracker) and Deadlines (roadmap).
// All web work happens in the API routes (TinyFish + Claude); this page streams their NDJSON progress.
// After onboarding, every source loads in the background at once, so tabs are ready when opened.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Logo } from "@/components/Logo";
import { ActivityFeed, Spinner, type ActivityItem, type Source, type Stats } from "@/components/ActivityFeed";
import { LoadingScreen } from "@/components/LoadingScreen";
import { Toast } from "@/components/Toast";
import { MatchCard, deadlineLabel } from "@/components/MatchCard";
import { EventsTable } from "@/components/EventsTable";
import { CoursesList } from "@/components/CoursesList";
import { FindPanel } from "@/components/FindPanel";
import { TrackerTable } from "@/components/TrackerTable";
import { Roadmap } from "@/components/Roadmap";
import { EMPTY_PROFILE, EMPTY_RESULTS, loadProfile, loadResults, saveResults, type Results } from "@/lib/store";
import { daysUntil, emptyRow, loadTracker, rowFromOpportunity, saveTracker, trackerKey } from "@/lib/tracker";
import type { LumaEvent, Opportunity, Profile, ProgressEvent, ResearchOpportunity, Stage, TrackerRow } from "@/lib/types";

type View = "matches" | "events" | "courses" | "research" | "people" | "saved" | "deadlines";

const VIEWS: { id: View; label: string; source?: Source }[] = [
  { id: "matches", label: "Matches", source: "map" },
  { id: "events", label: "Events", source: "events" },
  { id: "courses", label: "Courses", source: "courses" },
  { id: "research", label: "Research", source: "research" },
  { id: "people", label: "People", source: "people" },
  { id: "saved", label: "Saved" },
  { id: "deadlines", label: "Deadlines" },
];

const PATHS: Record<Source, string> = {
  map: "/api/map",
  events: "/api/events",
  courses: "/api/courses",
  research: "/api/research",
  people: "/api/people",
};

const TYPE_LABEL: Record<string, string> = {
  "spring week": "Spring weeks",
  "insight day": "Insight days",
  internship: "Internships",
  "work experience": "Work experience",
  placement: "Placements",
  "graduate scheme": "Grad schemes",
  apprenticeship: "Apprenticeships",
  fellowship: "Fellowships",
  residency: "Residencies",
  competition: "Competitions",
  volunteering: "Volunteering",
  other: "Other",
};

const NO_STATS: Stats = { searched: 0, read: 0, found: 0 };
const IDLE: Record<Source, boolean> = { map: false, events: false, courses: false, research: false, people: false };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
}

const topFrom = (list: Opportunity[]) => list.slice(0, 5).map((o) => `${o.firm} ${o.programme_name} (${o.eligibility})`);

export default function Matches() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [results, setResults] = useState<Results>(EMPTY_RESULTS);
  const [tracker, setTracker] = useState<TrackerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("matches");
  const [running, setRunning] = useState<Record<Source, boolean>>(IDLE);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<Record<Source, Stats>>({ map: NO_STATS, events: NO_STATS, courses: NO_STATS, research: NO_STATS, people: NO_STATS });
  const [mapStage, setMapStage] = useState<Stage>("plan");
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const activityId = useRef(0);
  const dependentsStarted = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  // Load saved state once in the browser. No profile → onboarding first.
  // With ?run=1 (fresh from onboarding), clear old results and load every source in the background.
  useEffect(() => {
    const p = loadProfile();
    if (!p.university) {
      router.replace("/onboarding");
      return;
    }
    const fresh = new URLSearchParams(window.location.search).get("run") === "1";
    // Clear stored results right away so a second effect run (React dev mode) can't reload stale ones.
    if (fresh) saveResults(EMPTY_RESULTS);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage only exists after mount */
    setProfile(p);
    setResults(fresh ? EMPTY_RESULTS : loadResults());
    setTracker(loadTracker());
    const fromHash = window.location.hash.slice(1) as View;
    if (VIEWS.some((v) => v.id === fromHash)) setView(fromHash);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (fresh) {
      window.history.replaceState(null, "", "/matches");
      startAll(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loaded) saveTracker(tracker);
  }, [tracker, loaded]);
  useEffect(() => {
    if (loaded) saveResults(results);
  }, [results, loaded]);

  const trackedKeys = useMemo(() => new Set(tracker.map((r) => trackerKey(r.source_url, r.programme))), [tracker]);
  const watched = tracker.filter((r) => r.monitored);
  const runningSources = (Object.keys(running) as Source[]).filter((s) => running[s]);
  const totalStats = runningSources.length
    ? runningSources.reduce((acc, s) => ({ searched: acc.searched + stats[s].searched, read: acc.read + stats[s].read, found: acc.found + stats[s].found }), NO_STATS)
    : stats.map;

  function go(v: View) {
    setView(v);
    window.history.replaceState(null, "", `#${v}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ---------- Streaming runs (one per source, in parallel) ----------

  function startAll(p: Profile) {
    dependentsStarted.current = false;
    runStream("map", p);
    runStream("events", p);
    runStream("research", p);
    // Courses and People start once the first matches arrive (they target the top 5).
  }

  async function runStream(source: Source, p: Profile = profile, extra: object = {}) {
    setRunning((r) => ({ ...r, [source]: true }));
    setStats((st) => ({ ...st, [source]: NO_STATS }));
    setActivity((a) => a.filter((i) => i.source !== source));
    if (source === "map") {
      setMapStage("plan");
      setError(null);
    }
    const body = source === "courses" || source === "people" ? { profile: p, ...extra } : p;
    try {
      const res = await fetch(PATHS[source], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
        for (const line of lines) if (line.trim()) handle(source, p, JSON.parse(line) as ProgressEvent);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning((r) => ({ ...r, [source]: false }));
    }
  }

  function handle(source: Source, p: Profile, e: ProgressEvent) {
    switch (e.type) {
      case "activity":
        setActivity((a) => [...a.slice(-150), { id: ++activityId.current, source, kind: e.kind, text: e.text, host: e.host, detail: e.detail }]);
        break;
      case "stats":
        setStats((st) => ({ ...st, [source]: { searched: e.searched, read: e.read, found: e.found } }));
        break;
      case "stage":
        if (source === "map") setMapStage(e.stage);
        break;
      case "queries":
        if (source === "map") setResults((r) => ({ ...r, queries: e.queries }));
        break;
      case "results":
        setResults((r) => ({ ...r, opportunities: e.opportunities, mappedAt: new Date().toISOString() }));
        if (!dependentsStarted.current && e.opportunities.length) {
          dependentsStarted.current = true;
          const top = topFrom(e.opportunities);
          // Small stagger keeps us under TinyFish Search's 30 requests/minute.
          setTimeout(() => runStream("courses", p, { topOpportunities: top }), 1500);
          setTimeout(() => runStream("people", p, { topOpportunities: top }), 4000);
        }
        break;
      case "events":
        setResults((r) => ({ ...r, events: e.events }));
        break;
      case "courses":
        setResults((r) => ({ ...r, courses: e.courses }));
        break;
      case "research":
        setResults((r) => ({ ...r, research: e.research }));
        break;
      case "people":
        setResults((r) => ({ ...r, people: e.people }));
        break;
      case "error":
        setError(e.message);
        break;
    }
  }

  // ---------- Tracker + Monitor ----------

  const patchRow = (id: string, patch: Partial<TrackerRow>) =>
    setTracker((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const saveOpportunity = (o: Opportunity) => {
    setTracker((rows) => [...rows, rowFromOpportunity(o)]);
    notify("★ Saved to your shortlist");
  };
  const saveEvent = (e: LumaEvent) => {
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
    notify("★ Event saved");
  };
  const saveResearch = (r: ResearchOpportunity) => {
    setTracker((rows) => [
      ...rows,
      { ...emptyRow(), firm: r.organisation, programme: r.name, type: "research", deadline: r.deadline, notes: r.summary, source_url: r.url },
    ]);
    notify("★ Saved to your shortlist");
  };

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
      notify(`👀 Watching ${r.firm}`);
    });

  const checkRow = (r: TrackerRow) =>
    withBusy(r.id, async () => {
      if (!r.monitor_id) return;
      const data = await callMonitor("POST", { action: "check", id: r.monitor_id });
      const changed = !!r.monitor_baseline_hash && !!data.hash && data.hash !== r.monitor_baseline_hash;
      patchRow(r.id, { monitor_changed: changed, monitor_last_check: new Date().toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) });
      notify(changed ? `${r.firm}'s page changed` : `No change at ${r.firm}`);
    });

  const unwatchRow = (r: TrackerRow) =>
    withBusy(r.id, async () => {
      if (r.monitor_id) await callMonitor("DELETE", { id: r.monitor_id });
      patchRow(r.id, { monitored: false, monitor_id: undefined, monitor_baseline_hash: undefined, monitor_changed: undefined, monitor_last_check: undefined });
    });

  // ---------- Derived ----------

  const oppKey = (o: Opportunity) => o.source_url + "|" + o.programme_name;
  const typesPresent = [...new Set(results.opportunities.map((o) => o.type))];
  const feed = results.opportunities.filter((o) => {
    if (hidden.has(oppKey(o))) return false;
    if (typeFilter !== "all" && o.type !== typeFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [o.firm, o.programme_name, o.reason, o.location].some((f) => f.toLowerCase().includes(q));
  });

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

  const name = profile.name?.trim() || "you";
  const showLoading = view === "matches" && running.map && results.opportunities.length === 0;
  const counts: Partial<Record<View, number>> = {
    matches: results.opportunities.length,
    events: results.events.length,
    courses: results.courses.length,
    research: results.research.length,
    people: results.people.length,
    saved: tracker.length,
  };

  const heroes: Record<View, { eyebrow: string; title: React.ReactNode }> = {
    matches: {
      eyebrow: results.mappedAt ? `Live from the web · ${new Date(results.mappedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "Live from the web",
      title: (
        <>
          {greeting()}, {profile.name?.trim() || "there"}. <span className="hl">{feed.length} live</span> picks.
        </>
      ),
    },
    events: { eyebrow: "Upcoming in London", title: <>Events worth leaving the <span className="hl">library</span> for.</> },
    courses: { eyebrow: "Close the gap", title: <>Courses that get you <span className="hl">ready</span>.</> },
    research: { eyebrow: "Research", title: <>Get into <span className="hl">research</span> early.</> },
    people: { eyebrow: "People", title: <>Who to <span className="hl">learn from</span>.</> },
    saved: { eyebrow: "Saved", title: <>Your <span className="hl">shortlist</span>.</> },
    deadlines: { eyebrow: "Deadlines", title: <>The next six <span className="hl">months</span>.</> },
  };

  if (!loaded) return <div className="min-h-screen" />;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen pb-28 md:pb-0">
        <AppHeader view={view} go={go} search={search} setSearch={setSearch} initial={(profile.name?.trim()[0] ?? "Y").toUpperCase()} running={running} counts={counts} />

        <div className="mx-auto max-w-[1280px] px-6 pt-12 pb-20">
          <AnimatePresence mode="wait">
            {showLoading ? (
              <LoadingScreen key="loading" name={name} stage={mapStage} stats={stats.map} queries={results.queries} items={activity.filter((i) => i.source === "map")} candidates={15} />
            ) : (
              <motion.div key="app" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                {/* Hero row */}
                <div className="mb-9 flex flex-wrap items-end gap-6">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={view}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="min-w-0 flex-[1_1_480px]"
                    >
                      <div className="eyebrow tracking-[0.16em] text-blue">{heroes[view].eyebrow}</div>
                      <h1 className="mt-2.5 text-[clamp(38px,5vw,68px)] leading-[0.95] font-black tracking-[-0.05em]">{heroes[view].title}</h1>
                    </motion.div>
                  </AnimatePresence>
                  <motion.button
                    type="button"
                    onClick={() => go("deadlines")}
                    initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
                    animate={{ rotate: 1.5, scale: 1, opacity: 1 }}
                    whileHover={{ rotate: -1, y: -2 }}
                    transition={{ type: "spring", stiffness: 300, damping: 12 }}
                    className="flex cursor-pointer items-center gap-3 border-2 border-ink bg-blue px-4.5 py-3.5 text-left text-cream shadow-[4px_4px_0_#111]"
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
                  </motion.button>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-8 flex items-start gap-3 border-2 border-ink bg-white px-5 py-4 font-bold shadow-[4px_4px_0_#111]"
                    >
                      <span className="eyebrow text-blue">Heads up</span>
                      <span className="flex-1">{error}</span>
                      <button type="button" onClick={() => setError(null)} className="cursor-pointer text-lg leading-none" aria-label="Dismiss">
                        ×
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex flex-wrap items-start gap-8">
                  {/* Aside */}
                  <aside className="flex max-w-full min-w-0 flex-[1_1_260px] flex-col gap-6 max-md:order-2">
                    {view === "matches" && (
                      <div className="card p-5.5">
                        {typesPresent.length > 1 && (
                          <>
                            <div className="eyebrow text-[11px] text-muted">Type</div>
                            <div className="mt-3 mb-6 flex flex-wrap gap-2">
                              {["all", ...typesPresent].map((t) => {
                                const on = typeFilter === t;
                                return (
                                  <motion.button
                                    key={t}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setTypeFilter(t)}
                                    whileTap={{ scale: 0.95 }}
                                    className={`min-h-10 cursor-pointer border-2 border-ink px-3 py-2 text-[13px] font-bold transition-[background,box-shadow] ${on ? "bg-blue text-cream shadow-[3px_3px_0_#111]" : "bg-cream hover:bg-sand"}`}
                                  >
                                    {t === "all" ? "All" : TYPE_LABEL[t] ?? t}
                                  </motion.button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        <div className="eyebrow text-[11px] text-muted">Driven by</div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {(profile.motivations.length ? profile.motivations : ["Not set yet"]).map((m) => (
                            <span key={m} className="chip bg-sky">
                              {m}
                            </span>
                          ))}
                        </div>
                        <div className="eyebrow mt-5 text-[11px] text-muted">Aiming for</div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {profile.targetPaths.map((m) => (
                            <span key={m} className="chip bg-white">
                              {m}
                            </span>
                          ))}
                        </div>
                        <div className="mt-6 flex flex-wrap gap-2">
                          <button type="button" disabled={running.map} onClick={() => runStream("map")} className="btn btn-ink press flex-1">
                            {running.map ? "Hunting…" : "Refresh matches"}
                          </button>
                          <Link href="/onboarding" className="btn btn-cream press">
                            Edit
                          </Link>
                        </div>
                      </div>
                    )}

                    <ActivityFeed items={activity} stats={totalStats} running={runningSources} />

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
                  <AnimatePresence mode="wait">
                    <motion.section
                      key={view}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.22 }}
                      className="flex min-w-0 flex-[999_1_560px] flex-col gap-6"
                    >
                      {view === "matches" && (
                        <>
                          {running.map && results.opportunities.length > 0 && (
                            <div className="flex items-center gap-2 self-start border-2 border-ink bg-sky px-3 py-1.5 text-sm font-bold">
                              <Spinner /> Still finding more, these will re-rank as they land
                            </div>
                          )}
                          {feed.length === 0 ? (
                            <div className="border-2 border-dashed border-ink bg-sand px-6 py-16 text-center">
                              <div className="text-2xl font-black tracking-[-0.02em]">
                                {results.opportunities.length ? "Nothing matches that filter." : "No matches yet."}
                              </div>
                              <p className="mt-2 text-body">Hit “Refresh matches” to search the live web.</p>
                            </div>
                          ) : (
                            <AnimatePresence initial={true}>
                              {feed.map((o, i) => (
                                <motion.div
                                  key={oppKey(o)}
                                  layout
                                  initial={{ opacity: 0, y: 24 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, x: 80, rotate: 3, transition: { duration: 0.25 } }}
                                  transition={{ delay: Math.min(i, 8) * 0.05, type: "spring", stiffness: 260, damping: 26 }}
                                  whileHover={{ y: -3 }}
                                >
                                  <MatchCard
                                    o={o}
                                    hero={i === 0}
                                    saved={trackedKeys.has(trackerKey(o.source_url, o.programme_name))}
                                    onSave={() => saveOpportunity(o)}
                                    onHide={() => setHidden((h) => new Set(h).add(oppKey(o)))}
                                  />
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          )}
                        </>
                      )}

                      {view === "events" && (
                        <FindPanel
                          label="Refresh events"
                          hint="Upcoming Luma events matched to you. We never register on your behalf."
                          running={running.events}
                          canRun
                          onFind={() => runStream("events")}
                          empty={results.events.length === 0}
                          emptyText={running.events ? "Reading London event calendars…" : "No events yet."}
                        >
                          <EventsTable events={results.events} onAdd={saveEvent} trackedKeys={trackedKeys} />
                        </FindPanel>
                      )}

                      {view === "courses" && (
                        <FindPanel
                          label="Refresh courses"
                          hint="Matched to the gaps between you and your top 5 picks."
                          running={running.courses}
                          canRun={results.opportunities.length > 0}
                          onFind={() => runStream("courses", profile, { topOpportunities: topFrom(results.opportunities) })}
                          empty={results.courses.length === 0}
                          emptyText={running.courses ? "Spotting your gaps…" : running.map ? "Courses start as soon as your first matches land." : "No courses yet."}
                        >
                          <CoursesList courses={results.courses} />
                        </FindPanel>
                      )}

                      {view === "research" && (
                        <FindPanel
                          label="Refresh research"
                          hint="University schemes, labs, archives and research roles that take undergraduates."
                          running={running.research}
                          canRun
                          onFind={() => runStream("research")}
                          empty={results.research.length === 0}
                          emptyText={running.research ? "Reading research scheme pages…" : "No research picks yet."}
                        >
                          {results.research.map((r, i) => {
                            const saved = trackedKeys.has(trackerKey(r.url, r.name));
                            return (
                              <motion.article
                                key={r.url + r.name}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i, 8) * 0.05 }}
                                className="card p-6"
                              >
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
                              </motion.article>
                            );
                          })}
                        </FindPanel>
                      )}

                      {view === "people" && (
                        <FindPanel
                          label="Refresh people"
                          hint="Public pages only: team pages, speaker lists, staff pages. No LinkedIn, no contact details."
                          running={running.people}
                          canRun={results.opportunities.length > 0}
                          onFind={() => runStream("people", profile, { topOpportunities: topFrom(results.opportunities) })}
                          empty={results.people.length === 0}
                          emptyText={running.people ? "Reading public team and speaker pages…" : running.map ? "People start as soon as your first matches land." : "No people yet."}
                        >
                          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {results.people.map((p, i) => (
                              <motion.article
                                key={i}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: Math.min(i, 8) * 0.05 }}
                                className="card flex flex-col p-6"
                              >
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
                              </motion.article>
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
                    </motion.section>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Toast message={toast} />
        <MobileTabBar view={view} go={go} />
      </div>
    </MotionConfig>
  );
}

function AppHeader({
  view,
  go,
  search,
  setSearch,
  initial,
  running,
  counts,
}: {
  view: View;
  go: (v: View) => void;
  search: string;
  setSearch: (s: string) => void;
  initial: string;
  running: Record<Source, boolean>;
  counts: Partial<Record<View, number>>;
}) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-ink bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-4">
        <Logo />
        <nav className="eyebrow -mx-1 flex max-w-full gap-1 overflow-x-auto px-1 tracking-[0.1em] max-md:order-3 max-md:w-full">
          {VIEWS.map((v) => {
            const active = view === v.id;
            const busy = v.source ? running[v.source] : false;
            const n = counts[v.id];
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => go(v.id)}
                className={`relative flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2.5 whitespace-nowrap uppercase ${active ? "text-cream" : "text-ink hover:bg-sand"}`}
              >
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 bg-ink" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className="relative">{v.label}</span>
                {busy ? (
                  <Spinner className="relative" />
                ) : n ? (
                  <span className={`relative px-1 text-[10px] ${active ? "bg-cream text-ink" : "bg-sky text-ink"}`}>{n}</span>
                ) : null}
              </button>
            );
          })}
          <Link href="/onboarding" className="shrink-0 px-3 py-2.5 whitespace-nowrap text-ink no-underline hover:bg-sand hover:text-ink">
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
          <motion.button key={t.id} type="button" whileTap={{ scale: 0.9 }} onClick={() => go(t.id as View)} className={`${cls} cursor-pointer`}>
            {inner}
          </motion.button>
        );
      })}
    </nav>
  );
}
