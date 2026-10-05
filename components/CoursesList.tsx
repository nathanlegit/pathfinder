"use client";

import type { Course } from "@/lib/types";

type Props = {
  courses: Course[];
  running: boolean;
  canRun: boolean;
  hasOpportunities: boolean;
  onFind: () => void;
};

export function CoursesList({ courses, running, canRun, hasOpportunities, onFind }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onFind}
          disabled={running || !canRun}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Searching…" : "Find courses to close my gaps"}
        </button>
        <span className="text-xs text-zinc-500">
          {!canRun
            ? "Fill in your profile first."
            : hasOpportunities
              ? "Matched to the gaps between you and your top 5 opportunities."
              : "Tip: map your path first so courses target your top opportunities."}
        </span>
      </div>

      {courses.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">No courses yet.</p>
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => (
            <li key={c.url} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-zinc-100 hover:underline">
                  {c.title}
                </a>
                <span className="text-xs text-zinc-500">
                  {[c.cost, c.length].filter((x) => x && x !== "unknown").join(" · ") || "cost and length not listed"}
                </span>
              </div>
              <div className="text-xs text-zinc-500">{c.provider}</div>
              <p className="mt-2 text-sm text-zinc-400">
                <span className="text-emerald-400">Closes gap:</span> {c.fills_gap}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
