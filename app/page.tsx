"use client";

import { useEffect, useMemo, useState } from "react";
import { ProfileForm } from "@/components/ProfileForm";
import { ProgressLog } from "@/components/ProgressLog";
import { OpportunitiesTable } from "@/components/OpportunitiesTable";
import { TrackerTable } from "@/components/TrackerTable";
import { EventsTable } from "@/components/EventsTable";
import { emptyRow, loadTracker, rowFromOpportunity, saveTracker, trackerKey } from "@/lib/tracker";
import { CoursesList } from "@/components/CoursesList";
import { Roadmap } from "@/components/Roadmap";
import { FindPanel } from "@/components/FindPanel";
import type { Course, LumaEvent, Person, ResearchOpportunity, Opportunity, Profile, ProgressEvent, TrackerRow } from "@/lib/types";

type Tab = "opportunities" | "events" | "courses" | "research" | "people" | "tracker" | "roadmap";

const EMPTY_PROFILE: Profile = {
  university: "",
  degree: "",
  yearOfStudy: "1st year",
  interests: "",
  targetPaths: [],
  locations: "London, UK",
  experience: "",
};

export default function Home() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("opportunities");
  const [events, setEvents] = useState<LumaEvent[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [research, setResearch] = useState<ResearchOpportunity[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tracker, setTracker] = useState<TrackerRow[]>([]);
  const [trackerLoaded, setTrackerLoaded] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  // Load the tracker once on the client, then save on every change.
  // localStorage isn't available during server render, so this has to happen in an effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTracker(loadTracker());
    setTrackerLoaded(true);
  }, []);
  useEffect(() => {
    if (trackerLoaded) saveTracker(tracker);
  }, [tracker, trackerLoaded]);

  const trackedKeys = useMemo(() => new Set(tracker.map((r) => trackerKey(r.source_url, r.programme))), [tracker]);
  const watched = tracker.filter((r) => r.monitored);

  function addToTracker(o: Opportunity) {
    setTracker((rows) => [...rows, rowFromOpportunity(o)]);
  }

  const patchRow = (id: string, patch: Partial<TrackerRow>) =>
    setTracker((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Wraps a monitor API call: marks the row busy and surfaces errors in the banner.
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
    const res = await fetch("/api/monitor", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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
      patchRow(r.id, {
        monitored: false,
        monitor_id: undefined,
        monitor_baseline_hash: undefined,
        monitor_changed: undefined,
        monitor_last_check: undefined,
      });
    });

  // Streams NDJSON progress events from an API route and applies each to state.
  async function runStream(
    path: "/api/map" | "/api/events" | "/api/courses" | "/api/research" | "/api/people",
    body: object = profile,
  ) {
    setRunning(true);
    setLog([]);
    setQueries([]);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
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
          const event = JSON.parse(line) as ProgressEvent;
          if (event.type === "log") setLog((l) => [...l, event.message]);
          else if (event.type === "queries") setQueries(event.queries);
          else if (event.type === "results") setOpportunities(event.opportunities);
          else if (event.type === "events") setEvents(event.events);
          else if (event.type === "courses") setCourses(event.courses);
          else if (event.type === "research") setResearch(event.research);
          else if (event.type === "people") setPeople(event.people);
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const topOpportunities = () =>
    opportunities.slice(0, 5).map((o) => `${o.firm} ${o.programme_name} (${o.eligibility})`);

  function addResearchToTracker(r: ResearchOpportunity) {
    setTracker((rows) => [
      ...rows,
      { ...emptyRow(), firm: r.organisation, programme: r.name, type: "research", deadline: r.deadline, notes: r.summary, source_url: r.url },
    ]);
  }

  const mapMyPath = () => {
    setTab("opportunities");
    runStream("/api/map");
  };

  function addEventToTracker(e: LumaEvent) {
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
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Pathfinder</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Live spring weeks and internships, found on the open web by TinyFish and ranked for you.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <ProfileForm profile={profile} onChange={setProfile} onSubmit={mapMyPath} running={running} />
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Watching ({watched.length})
            </h2>
            {watched.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Hit Watch on a tracked opportunity and TinyFish Monitor checks its page daily.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {watched.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-zinc-200">{r.firm}</div>
                      <div className="truncate text-xs text-zinc-500">{r.programme}</div>
                    </div>
                    {r.monitor_changed && (
                      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">changed</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-zinc-600">
              Daily checks run on TinyFish even when this tab is closed. Diffs and email alerts are in the TinyFish dashboard.
            </p>
          </section>
        </aside>

        <section className="min-w-0 space-y-6">
          <ProgressLog lines={log} queries={queries} />
          <div>
            <nav className="mb-3 flex gap-1 overflow-x-auto border-b border-zinc-800">
              {(
                [
                  ["opportunities", `Opportunities${opportunities.length ? ` (${opportunities.length})` : ""}`],
                  ["events", `Events${events.length ? ` (${events.length})` : ""}`],
                  ["courses", `Courses${courses.length ? ` (${courses.length})` : ""}`],
                  ["research", `Research${research.length ? ` (${research.length})` : ""}`],
                  ["people", `People${people.length ? ` (${people.length})` : ""}`],
                  ["tracker", `Tracker${tracker.length ? ` (${tracker.length})` : ""}`],
                  ["roadmap", "Roadmap"],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition ${
                    tab === key ? "border-emerald-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "opportunities" ? (
              <OpportunitiesTable rows={opportunities} onAdd={addToTracker} trackedUrls={trackedKeys} />
            ) : tab === "events" ? (
              <EventsTable
                events={events}
                running={running}
                canRun={!!profile.university}
                onFind={() => runStream("/api/events")}
                onAdd={addEventToTracker}
                trackedKeys={trackedKeys}
              />
            ) : tab === "courses" ? (
              <CoursesList
                courses={courses}
                running={running}
                canRun={!!profile.university}
                hasOpportunities={opportunities.length > 0}
                onFind={() =>
                  runStream("/api/courses", { profile, topOpportunities: topOpportunities() })
                }
              />
            ) : tab === "research" ? (
              <FindPanel
                label="Find research opportunities"
                hint="University research schemes and labs that take undergraduates."
                running={running}
                canRun={!!profile.university}
                onFind={() => runStream("/api/research")}
                empty={research.length === 0}
              >
                <ul className="space-y-3">
                  {research.map((r, i) => {
                    const tracked = trackedKeys.has(trackerKey(r.url, r.name));
                    return (
                      <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-zinc-100 hover:underline">
                            {r.name}
                          </a>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${
                              r.takes_undergraduates === "yes" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {r.takes_undergraduates === "yes" ? "takes undergraduates" : "undergraduates: check page"}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500">
                          {r.organisation} · deadline {r.deadline}
                        </div>
                        <p className="mt-2 text-sm text-zinc-300">{r.summary}</p>
                        <p className="mt-1 text-sm text-zinc-400">{r.why}</p>
                        <button
                          disabled={tracked}
                          onClick={() => addResearchToTracker(r)}
                          className="mt-3 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300 disabled:border-transparent disabled:text-zinc-600"
                        >
                          {tracked ? "Tracked" : "+ Track"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </FindPanel>
            ) : tab === "people" ? (
              <FindPanel
                label="Find people worth learning from"
                hint="From public pages only: firm team pages, speaker lists, staff pages. No LinkedIn, no contact details."
                running={running}
                canRun={!!profile.university}
                onFind={() => runStream("/api/people", { profile, topOpportunities: topOpportunities() })}
                empty={people.length === 0}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {people.map((p, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <div className="font-medium text-zinc-100">{p.name}</div>
                      <div className="text-xs text-zinc-500">
                        {p.role} · {p.organisation}
                      </div>
                      <p className="mt-2 text-sm text-zinc-400">{p.why}</p>
                      <a href={p.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-emerald-400 hover:underline">
                        Source: {new URL(p.url).hostname.replace(/^www\./, "")} ↗
                      </a>
                    </div>
                  ))}
                </div>
              </FindPanel>
            ) : tab === "roadmap" ? (
              <Roadmap opportunities={opportunities} tracker={tracker} events={events} courses={courses} />
            ) : (
              <TrackerTable
                rows={tracker}
                onChange={setTracker}
                onWatch={watchRow}
                onCheck={checkRow}
                onUnwatch={unwatchRow}
                busyIds={busyIds}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
