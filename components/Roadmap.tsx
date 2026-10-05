"use client";

// A 6-month timeline built from what Pathfinder has already found:
// deadlines from top opportunities and tracked rows, upcoming events, and courses slotted
// to finish before the earliest deadline they help with.

import type { Course, LumaEvent, Opportunity, TrackerRow } from "@/lib/types";

type Item = { date: string; label: string; sub: string; kind: "deadline" | "event" | "course"; url?: string };

const KIND_STYLE: Record<Item["kind"], string> = {
  deadline: "border-l-blue",
  event: "border-l-sky",
  course: "border-l-ink",
};

const isIso = (d: string) => /^\d{4}-\d{2}-\d{2}/.test(d);

// Rough course length in weeks from strings like "6 weeks at 10 hours a week"; default 4.
function weeksOf(length: string): number {
  const m = length.match(/(\d+)\s*week/i);
  return m ? Number(m[1]) : 4;
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function Roadmap({
  opportunities,
  tracker,
  events,
  courses,
}: {
  opportunities: Opportunity[];
  tracker: TrackerRow[];
  events: LumaEvent[];
  courses: Course[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 183);
  const inRange = (d: string) => isIso(d) && d >= today && d <= horizon;

  const items: Item[] = [];
  const seen = new Set<string>();
  for (const r of tracker) {
    if (!inRange(r.deadline)) continue;
    seen.add(r.firm + r.programme);
    items.push({
      date: r.deadline.slice(0, 10),
      label: r.programme,
      sub: `${r.firm} · ${r.type === "event" ? "event (tracked)" : `deadline · ${r.my_status}`}`,
      kind: r.type === "event" ? "event" : "deadline",
      url: r.source_url,
    });
  }
  for (const o of opportunities.filter((o) => o.score >= 40)) {
    if (!inRange(o.deadline) || seen.has(o.firm + o.programme_name)) continue;
    items.push({ date: o.deadline.slice(0, 10), label: o.programme_name, sub: `${o.firm} · deadline · fit ${o.score}`, kind: "deadline", url: o.source_url });
  }
  for (const e of events.slice(0, 6)) {
    if (!inRange(e.date) || seen.has(e.organiser + e.title)) continue;
    items.push({ date: e.date, label: e.title, sub: `${e.organiser} · event`, kind: "event", url: e.url });
  }

  // Each course should finish before the earliest upcoming deadline; start it that many weeks earlier,
  // or today if there isn't enough time.
  const firstDeadline = items.filter((i) => i.kind === "deadline").map((i) => i.date).sort()[0];
  for (const c of courses) {
    const start = firstDeadline ? addDays(firstDeadline, -7 * weeksOf(c.length)) : today;
    items.push({
      date: start < today ? today : start,
      label: `Start: ${c.title}`,
      sub: `${c.provider}${firstDeadline ? ` · finish before ${firstDeadline}` : ""}`,
      kind: "course",
      url: c.url,
    });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));

  // Group by month.
  const months = new Map<string, Item[]>();
  for (const i of items) {
    const key = new Date(i.date + "T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    months.set(key, [...(months.get(key) ?? []), i]);
  }

  if (items.length === 0) {
    return (
      <div className="border-2 border-dashed border-ink bg-sand px-6 py-14 text-center font-bold">
        Your deadlines fill in from dated matches, saved rows, events and courses. Map your path first.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="eyebrow flex flex-wrap gap-5 text-[11px] text-muted">
        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-ink bg-blue" />Deadlines</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-ink bg-sky" />Events</span>
        <span className="flex items-center gap-2"><span className="h-3 w-3 border-2 border-ink bg-ink" />Courses</span>
        <span>Next 6 months · real dates only</span>
      </div>
      {[...months.entries()].map(([month, list]) => (
        <section key={month}>
          <h3 className="mb-4 text-[28px] font-black tracking-[-0.03em]">{month}</h3>
          <ol className="flex flex-col gap-3">
            {list.map((i, idx) => (
              <li key={idx} className={`flex gap-4 border-2 border-l-[10px] border-ink bg-white px-4 py-3 shadow-[4px_4px_0_#111] ${KIND_STYLE[i.kind]}`}>
                <span className="eyebrow w-16 shrink-0 pt-0.5 text-[11px] text-blue">
                  {new Date(i.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </span>
                <div className="min-w-0">
                  {i.url ? (
                    <a href={i.url} target="_blank" rel="noreferrer" className="font-extrabold text-ink hover:text-blue">
                      {i.label}
                    </a>
                  ) : (
                    <span className="font-extrabold">{i.label}</span>
                  )}
                  <div className="truncate text-sm text-muted">{i.sub}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
