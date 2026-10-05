"use client";

import { useMemo, useState } from "react";
import type { Opportunity } from "@/lib/types";

type SortKey = "score" | "firm" | "deadline" | "status" | "type";

export function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-300",
    "opening soon": "bg-amber-500/15 text-amber-300",
    closed: "bg-red-500/15 text-red-300",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${colours[status] ?? "bg-zinc-800 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const colour = score >= 70 ? "text-emerald-300" : score >= 40 ? "text-amber-300" : "text-zinc-500";
  return <span className={`font-mono text-sm font-semibold ${colour}`}>{score}</span>;
}

// Deadlines sort with real dates first, then "rolling", then "unknown".
function deadlineKey(d: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d;
  return d === "rolling" ? "9998" : "9999";
}

export function OpportunitiesTable({
  rows,
  onAdd,
  trackedUrls,
}: {
  rows: Opportunity[];
  onAdd?: (o: Opportunity) => void;
  trackedUrls?: Set<string>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let cmp: number;
      if (sortKey === "score") cmp = a.score - b.score;
      else if (sortKey === "deadline") cmp = deadlineKey(a.deadline).localeCompare(deadlineKey(b.deadline));
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, asc]);

  const header = (key: SortKey, label: string) => (
    <th
      className="cursor-pointer select-none px-3 py-2 text-left font-medium hover:text-zinc-200"
      onClick={() => {
        if (key === sortKey) setAsc(!asc);
        else {
          setSortKey(key);
          setAsc(key === "deadline" || key === "firm");
        }
      }}
    >
      {label} {sortKey === key ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  if (rows.length === 0) {
    return <p className="py-12 text-center text-sm text-zinc-500">No opportunities yet. Fill in your profile and hit Map my path.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
          <tr>
            {header("score", "Fit")}
            {header("firm", "Firm / programme")}
            {header("type", "Type")}
            {header("status", "Status")}
            {header("deadline", "Deadline")}
            <th className="px-3 py-2 text-left font-medium">Why</th>
            <th className="px-3 py-2 text-left font-medium">Source</th>
            {onAdd && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {sorted.map((o, i) => {
            const tracked = trackedUrls?.has(o.source_url + "|" + o.programme_name);
            return (
              <tr key={i} className="align-top hover:bg-zinc-900/60">
                <td className="px-3 py-2.5">
                  <ScorePill score={o.score} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="font-medium text-zinc-100">{o.firm}</div>
                  <div className="text-zinc-400">{o.programme_name}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {o.location} · {o.eligibility}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-zinc-300">{o.type}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap font-mono text-xs text-zinc-300">{o.deadline}</td>
                <td className="max-w-xs px-3 py-2.5 text-zinc-400">{o.reason}</td>
                <td className="px-3 py-2.5">
                  <a
                    href={o.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:underline"
                    title={o.source_url}
                  >
                    {new URL(o.source_url).hostname.replace(/^www\./, "")}
                  </a>
                  {o.via === "agent" && (
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-sky-400">via Agent</div>
                  )}
                </td>
                {onAdd && (
                  <td className="px-3 py-2.5">
                    <button
                      disabled={tracked}
                      onClick={() => onAdd(o)}
                      className="whitespace-nowrap rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300 disabled:border-transparent disabled:text-zinc-600"
                    >
                      {tracked ? "Tracked" : "+ Track"}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
