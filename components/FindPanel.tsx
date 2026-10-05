"use client";

// Shared shell for the on-demand tabs: a "find" button, a hint, and the results (or an empty state).

export function FindPanel({
  label,
  hint,
  running,
  canRun,
  onFind,
  empty,
  children,
}: {
  label: string;
  hint: string;
  running: boolean;
  canRun: boolean;
  onFind: () => void;
  empty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onFind}
          disabled={running || !canRun}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? "Searching…" : label}
        </button>
        <span className="text-xs text-zinc-500">{canRun ? hint : "Fill in your profile first."}</span>
      </div>
      {empty ? <p className="py-12 text-center text-sm text-zinc-500">Nothing yet.</p> : children}
    </div>
  );
}
