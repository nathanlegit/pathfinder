"use client";

import { trackerKey } from "@/lib/tracker";
import type { LumaEvent } from "@/lib/types";

function prettyDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// Upcoming Luma events as cards. The best match gets the blue hero treatment.
export function EventsTable({
  events,
  onAdd,
  trackedKeys,
}: {
  events: LumaEvent[];
  onAdd: (e: LumaEvent) => void;
  trackedKeys: Set<string>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {events.map((e, i) => {
        const tracked = trackedKeys.has(trackerKey(e.url, e.title));
        const hero = i === 0;
        return (
          <article
            key={e.url}
            className={`flex flex-col border-2 border-ink p-6 ${hero ? "bg-blue text-cream shadow-[8px_8px_0_#111] lg:col-span-2" : "bg-white shadow-[6px_6px_0_#111]"}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <span className={`chip font-extrabold ${hero ? "bg-sky text-ink" : "bg-blue text-cream"}`}>Relevance {e.score}</span>
              <span className="eyebrow text-[11px] tracking-[0.12em]">
                {prettyDate(e.date)}
                {e.time && e.time !== "unknown" ? ` · ${e.time}` : ""}
              </span>
            </div>
            <h3 className="mt-4 mb-1 text-[24px] leading-[1.05] font-black tracking-[-0.03em]">{e.title}</h3>
            <div className="text-[15px] font-semibold opacity-85">
              {e.organiser}
              {e.venue && e.venue !== "unknown" ? ` · ${e.venue}` : ""}
            </div>
            <div className={`mt-4 flex-1 border-2 px-4 py-3 text-[15px] leading-normal ${hero ? "border-cream" : "border-ink bg-cream"}`}>
              <b>Why go:</b> {e.why}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a href={e.url} target="_blank" rel="noreferrer" className={`btn press ${hero ? "btn-cream" : "btn-ink"}`}>
                Register on Luma →
              </a>
              <button type="button" disabled={tracked} onClick={() => onAdd(e)} className="btn btn-cream press disabled:opacity-100">
                {tracked ? "★ Saved" : "☆ Save"}
              </button>
              {e.via === "agent" && <span className={`ml-auto font-mono text-[11px] ${hero ? "text-sky" : "text-muted"}`}>via TinyFish Agent</span>}
            </div>
          </article>
        );
      })}
    </div>
  );
}
