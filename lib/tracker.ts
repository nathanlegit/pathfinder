// Tracker persistence: browser localStorage, plus CSV export/import as the user's backup.

import { MY_STATUSES, PRIORITIES, type Opportunity, type TrackerRow } from "./types";

const STORAGE_KEY = "pathfinder.tracker.v1";

export function loadTracker(): TrackerRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackerRow[]) : [];
  } catch {
    return [];
  }
}

export function saveTracker(rows: TrackerRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
  } catch {
    // Storage full or blocked: the CSV download is the fallback.
  }
}

export function trackerKey(sourceUrl: string, programme: string) {
  return sourceUrl + "|" + programme;
}

export function newRowId() {
  return Math.random().toString(36).slice(2, 10);
}

export function rowFromOpportunity(o: Opportunity): TrackerRow {
  return {
    id: newRowId(),
    firm: o.firm,
    programme: o.programme_name,
    type: o.type,
    deadline: o.deadline,
    my_status: "Not started",
    priority: o.score >= 70 ? "High" : o.score >= 40 ? "Medium" : "Low",
    notes: "",
    source_url: o.source_url,
    monitored: false,
    added_on: new Date().toISOString().slice(0, 10),
  };
}

export function emptyRow(): TrackerRow {
  return {
    id: newRowId(),
    firm: "",
    programme: "",
    type: "other",
    deadline: "unknown",
    my_status: "Not started",
    priority: "Medium",
    notes: "",
    source_url: "",
    monitored: false,
    added_on: new Date().toISOString().slice(0, 10),
  };
}

// Days until a deadline, or null when it isn't a real date.
export function daysUntil(deadline: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(deadline)) return null;
  const ms = new Date(deadline.slice(0, 10)).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.round(ms / 86_400_000);
}

// ---------- CSV ----------

const CSV_COLUMNS: (keyof TrackerRow)[] = [
  "firm",
  "programme",
  "type",
  "deadline",
  "my_status",
  "priority",
  "notes",
  "source_url",
  "monitored",
  "monitor_id",
  "added_on",
];

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: TrackerRow[]): string {
  return [CSV_COLUMNS.join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\n");
}

// Minimal RFC 4180 parser: handles quoted cells, escaped quotes and newlines in quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function fromCsv(text: string): TrackerRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  return body.map((cells) => {
    const get = (col: string) => cells[header.indexOf(col)] ?? "";
    const status = get("my_status") as TrackerRow["my_status"];
    const priority = get("priority") as TrackerRow["priority"];
    return {
      ...emptyRow(),
      firm: get("firm"),
      programme: get("programme"),
      type: get("type") || "other",
      deadline: get("deadline") || "unknown",
      my_status: MY_STATUSES.includes(status) ? status : "Not started",
      priority: PRIORITIES.includes(priority) ? priority : "Medium",
      notes: get("notes"),
      source_url: get("source_url"),
      monitored: get("monitored") === "true",
      monitor_id: get("monitor_id") || undefined,
      added_on: get("added_on") || new Date().toISOString().slice(0, 10),
    };
  });
}
