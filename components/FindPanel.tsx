"use client";

// Shared shell for the on-demand views: intro line, a "find" button, then results or an empty state.

export function FindPanel({
  label,
  hint,
  running,
  canRun,
  onFind,
  empty,
  emptyText,
  children,
}: {
  label: string;
  hint: string;
  running: boolean;
  canRun: boolean;
  onFind: () => void;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={onFind} disabled={running || !canRun} className="btn btn-blue press shadow-[4px_4px_0_#111]">
          {running ? "TinyFish is hunting…" : label}
        </button>
        <span className="text-sm text-muted">{hint}</span>
      </div>
      {empty ? (
        <div className="border-2 border-dashed border-ink bg-sand px-6 py-14 text-center font-bold">{emptyText}</div>
      ) : (
        children
      )}
    </div>
  );
}
