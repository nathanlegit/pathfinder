"use client";

import { useEffect, useRef } from "react";

export function ProgressLog({ lines, queries }: { lines: string[]; queries: string[] }) {
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, which useEffect rejects.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  return (
    <div className="space-y-3">
      {queries.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
            Search plan
          </div>
          <div className="flex flex-wrap gap-1.5">
            {queries.map((q) => (
              <span key={q} className="rounded-md bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">
                {q}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-black/40 p-3 font-mono text-xs leading-relaxed text-zinc-400">
        {lines.length === 0 ? (
          <span className="text-zinc-600">TinyFish activity will appear here.</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={l.startsWith("  ") ? "pl-4 text-zinc-500" : "text-zinc-300"}>
              {l.trim()}
            </div>
          ))
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
