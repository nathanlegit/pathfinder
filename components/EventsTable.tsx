"use client";

import { trackerKey } from "@/lib/tracker";
import type { LumaEvent } from "@/lib/types";

type Props = {
  events: LumaEvent[];
  running: boolean;
  canRun: boolean;
  onFind: () => void;
  onAdd: (e: LumaEvent) => void;
  trackedKeys: Set<string>;
};

function prettyDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function EventsTable({ events, running, canRun, onFind, onAdd, trackedKeys }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onFind}
          disabled={running || !canRun}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Searching…" : "Find London events on Luma"}
        </button>
        <span className="text-xs text-zinc-500">
          {canRun ? "Upcoming events matched to your profile. Pathfinder never registers for you." : "Fill in your profile first."}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No events yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {events.map((e) => {
            const tracked = trackedKeys.has(trackerKey(e.url, e.title));
            return (
              <div key={e.url} className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="font-mono text-xs text-emerald-400">
                    {prettyDate(e.date)}
                    {e.time && e.time !== "unknown" ? ` · ${e.time}` : ""}
                  </div>
                  <span className="font-mono text-xs text-zinc-500">{e.score}</span>
                </div>
                <a href={e.url} target="_blank" rel="noreferrer" className="font-medium text-zinc-100 hover:underline">
                  {e.title}
                </a>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {e.organiser} · {e.venue}
                </div>
                <p className="mt-2 flex-1 text-sm text-zinc-400">{e.why}</p>
                <div className="mt-3 flex items-center gap-2">
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500"
                  >
                    View on Luma ↗
                  </a>
                  <button
                    disabled={tracked}
                    onClick={() => onAdd(e)}
                    className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300 disabled:border-transparent disabled:text-zinc-600"
                  >
                    {tracked ? "Tracked" : "+ Track"}
                  </button>
                  {e.via === "agent" && <span className="text-[10px] uppercase tracking-wide text-sky-400">via Agent</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
