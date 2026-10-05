"use client";

import type { Course } from "@/lib/types";

// Courses grouped visually by the gap they close.
export function CoursesList({ courses }: { courses: Course[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {courses.map((c, i) => (
        <li key={c.url} className="card flex flex-wrap gap-6 p-6">
          <div className="text-[56px] leading-none font-black tracking-[-0.05em] text-blue">{String(i + 1).padStart(2, "0")}</div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-[11px] text-muted">{c.provider}</div>
            <a href={c.url} target="_blank" rel="noreferrer" className="mt-1 block text-[22px] leading-tight font-black tracking-[-0.02em] text-ink hover:text-blue">
              {c.title}
            </a>
            <div className="mt-3 flex flex-wrap gap-2">
              {[c.cost, c.length].filter((x) => x && x !== "unknown").map((x) => (
                <span key={x} className="chip bg-sky">
                  {x}
                </span>
              ))}
            </div>
            <div className="mt-4 border-2 border-ink bg-cream px-4 py-3 text-[15px] leading-normal">
              <b>Closes the gap:</b> {c.fills_gap}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
