"use client";

import { useMemo, useRef } from "react";
import { MY_STATUSES, PRIORITIES, type TrackerRow } from "@/lib/types";
import { daysUntil, emptyRow, fromCsv, toCsv } from "@/lib/tracker";

type Props = {
  rows: TrackerRow[];
  onChange: (rows: TrackerRow[]) => void;
  onWatch: (row: TrackerRow) => void;
  onCheck: (row: TrackerRow) => void;
  onUnwatch: (row: TrackerRow) => void;
  busyIds: Set<string>;
};

const cellInput =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-zinc-200 hover:border-zinc-700 focus:border-emerald-500 focus:bg-zinc-900 focus:outline-none";

// Real dates first (soonest at top), then rolling, then unknown.
function deadlineSort(d: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d : d === "rolling" ? "9998" : "9999";
}

export function TrackerTable({ rows, onChange, onWatch, onCheck, onUnwatch, busyIds }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const sorted = useMemo(
    () => [...rows].sort((a, b) => deadlineSort(a.deadline).localeCompare(deadlineSort(b.deadline))),
    [rows],
  );

  const update = (id: string, patch: Partial<TrackerRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function downloadCsv() {
    const blob = new Blob([toCsv(rows)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pathfinder-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function uploadCsv(file: File) {
    const imported = fromCsv(await file.text());
    onChange([...rows, ...imported]);
  }

  const btn =
    "rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-emerald-500 hover:text-emerald-300";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} onClick={() => onChange([...rows, emptyRow()])}>
          + Add row
        </button>
        <button className={btn} onClick={downloadCsv} disabled={rows.length === 0}>
          Download CSV
        </button>
        <button className={btn} onClick={() => fileInput.current?.click()}>
          Upload CSV
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadCsv(f);
            e.target.value = "";
          }}
        />
        <span className="ml-auto text-xs text-zinc-500">Saved in this browser. Download a CSV as a backup.</span>
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          Nothing tracked yet. Use “+ Track” on an opportunity, or add a row.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-2 py-2 text-left font-medium">Firm</th>
                <th className="px-2 py-2 text-left font-medium">Programme</th>
                <th className="px-2 py-2 text-left font-medium">Deadline ↑</th>
                <th className="px-2 py-2 text-left font-medium">My status</th>
                <th className="px-2 py-2 text-left font-medium">Priority</th>
                <th className="px-2 py-2 text-left font-medium">Notes</th>
                <th className="px-2 py-2 text-left font-medium">Watch</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map((r) => {
                const days = daysUntil(r.deadline);
                const urgent = days !== null && days >= 0 && days <= 14;
                const busy = busyIds.has(r.id);
                return (
                  <tr key={r.id} className={`align-top ${urgent ? "bg-amber-500/5" : ""}`}>
                    <td className="w-40 px-2 py-1.5">
                      <input className={cellInput} value={r.firm} onChange={(e) => update(r.id, { firm: e.target.value })} />
                      {r.source_url && (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate px-1.5 text-xs text-emerald-400 hover:underline"
                        >
                          source ↗
                        </a>
                      )}
                    </td>
                    <td className="w-64 px-2 py-1.5">
                      <input
                        className={cellInput}
                        value={r.programme}
                        onChange={(e) => update(r.id, { programme: e.target.value })}
                      />
                      <div className="px-1.5 text-xs text-zinc-500">{r.type}</div>
                    </td>
                    <td className="w-36 px-2 py-1.5">
                      <input
                        className={`${cellInput} font-mono text-xs`}
                        value={r.deadline}
                        onChange={(e) => update(r.id, { deadline: e.target.value })}
                      />
                      {days !== null && (
                        <div className={`px-1.5 text-xs ${urgent ? "font-medium text-amber-300" : days < 0 ? "text-zinc-600" : "text-zinc-500"}`}>
                          {days < 0 ? "passed" : days === 0 ? "today" : `${days} days`}
                        </div>
                      )}
                    </td>
                    <td className="w-36 px-2 py-1.5">
                      <select
                        className={cellInput}
                        value={r.my_status}
                        onChange={(e) => update(r.id, { my_status: e.target.value as TrackerRow["my_status"] })}
                      >
                        {MY_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="w-28 px-2 py-1.5">
                      <select
                        className={cellInput}
                        value={r.priority}
                        onChange={(e) => update(r.id, { priority: e.target.value as TrackerRow["priority"] })}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <textarea
                        rows={1}
                        className={`${cellInput} resize-y`}
                        value={r.notes}
                        onChange={(e) => update(r.id, { notes: e.target.value })}
                      />
                    </td>
                    <td className="w-44 px-2 py-1.5 text-xs">
                      {!r.source_url ? (
                        <span className="text-zinc-600">needs a source URL</span>
                      ) : !r.monitored ? (
                        <button disabled={busy} className={btn} onClick={() => onWatch(r)}>
                          {busy ? "Creating…" : "Watch"}
                        </button>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex gap-1">
                            <button disabled={busy} className={btn} onClick={() => onCheck(r)}>
                              {busy ? "Checking…" : "Check now"}
                            </button>
                            <button disabled={busy} className={btn} onClick={() => onUnwatch(r)} title="Stop watching">
                              ✕
                            </button>
                          </div>
                          {r.monitor_changed !== undefined && (
                            <div className={r.monitor_changed ? "text-amber-300" : "text-zinc-500"}>
                              {r.monitor_changed ? "Page changed" : "No change"} · {r.monitor_last_check}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        className="px-1 text-zinc-600 hover:text-red-400"
                        title="Delete row"
                        onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
