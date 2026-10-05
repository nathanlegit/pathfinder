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
  "w-full border-2 border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-ink hover:border-ink focus:border-ink focus:bg-white focus:outline-none";

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

  const btn = "btn btn-cream press px-3 py-1.5 text-xs shadow-[2px_2px_0_#111]";

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
        <span className="ml-auto text-sm text-muted">Saved in this browser. Download a CSV as a backup.</span>
      </div>

      {rows.length === 0 ? (
        <div className="border-2 border-dashed border-ink bg-sand px-6 py-14 text-center font-bold">
          Nothing saved yet. Hit ☆ Save on a match, event or research pick, or add a row.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="eyebrow bg-ink text-[11px] text-cream">
              <tr>
                <th className="px-2 py-3 text-left">Firm</th>
                <th className="px-2 py-3 text-left">Programme</th>
                <th className="px-2 py-3 text-left">Deadline ↑</th>
                <th className="px-2 py-3 text-left">My status</th>
                <th className="px-2 py-3 text-left">Priority</th>
                <th className="px-2 py-3 text-left">Notes</th>
                <th className="px-2 py-3 text-left">Watch</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-ink">
              {sorted.map((r) => {
                const days = daysUntil(r.deadline);
                const urgent = days !== null && days >= 0 && days <= 14;
                const busy = busyIds.has(r.id);
                return (
                  <tr key={r.id} className={`align-top ${urgent ? "bg-sky" : ""}`}>
                    <td className="w-40 px-2 py-1.5">
                      <input className={cellInput} value={r.firm} onChange={(e) => update(r.id, { firm: e.target.value })} />
                      {r.source_url && (
                        <a
                          href={r.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate px-1.5 text-xs font-bold"
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
                      <div className="eyebrow px-1.5 text-[10px] text-muted">{r.type}</div>
                    </td>
                    <td className="w-36 px-2 py-1.5">
                      <input
                        className={`${cellInput} font-mono text-xs`}
                        value={r.deadline}
                        onChange={(e) => update(r.id, { deadline: e.target.value })}
                      />
                      {days !== null && (
                        <div className={`px-1.5 text-xs ${urgent ? "font-extrabold text-blue" : "text-muted"}`}>
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
                        <span className="text-muted">needs a source URL</span>
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
                            <div className={r.monitor_changed ? "font-extrabold text-blue" : "text-muted"}>
                              {r.monitor_changed ? "Page changed" : "No change"} · {r.monitor_last_check}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        className="cursor-pointer px-1 text-lg font-black text-muted hover:text-ink"
                        title="Delete row"
                        onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                      >
                        ×
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
