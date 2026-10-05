"use client";

import { useEffect, useRef } from "react";

// Live log of what TinyFish is doing, plus the search plan Claude wrote.
export function ProgressLog({ lines, queries, running }: { lines: string[]; queries: string[]; running: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scroll methods, which useEffect rejects.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full border-2 border-ink ${running ? "animate-pulse bg-blue" : "bg-sky"}`} />
        <div className="eyebrow text-[11px] text-muted">{running ? "TinyFish is hunting…" : "TinyFish activity"}</div>
      </div>
      {queries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {queries.map((q) => (
            <span key={q} title={q} className="max-w-full truncate border-2 border-ink bg-sky px-2 py-0.5 font-mono text-[11px] font-medium">
              {q}
            </span>
          ))}
        </div>
      )}
      <div ref={box} className="mt-3 h-52 overflow-y-auto border-2 border-ink bg-cream p-3 font-mono text-[11px] leading-relaxed">
        {lines.length === 0 ? (
          <span className="text-muted">Nothing yet. Every search and page TinyFish reads shows up here.</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={l.startsWith("  ") ? "pl-3 text-muted" : "text-ink"}>
              {l.trim()}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
