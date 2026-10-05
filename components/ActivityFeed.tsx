"use client";

// Friendly, animated view of what TinyFish is doing: counters, then the latest few steps with
// an icon per kind and a site chip. Skipped pages are collapsed into a single quiet count.

import { AnimatePresence, motion } from "motion/react";
import type { ActivityKind } from "@/lib/types";

export type Source = "map" | "events" | "courses" | "research" | "people";
export type ActivityItem = { id: number; source: Source; kind: ActivityKind; text: string; host?: string; detail?: string };
export type Stats = { searched: number; read: number; found: number };

export const SOURCE_LABEL: Record<Source, string> = {
  map: "Matches",
  events: "Events",
  courses: "Courses",
  research: "Research",
  people: "People",
};

const KIND_STYLE: Record<ActivityKind, { bg: string; icon: React.ReactNode }> = {
  search: { bg: "bg-white", icon: <><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></> },
  read: { bg: "bg-white", icon: <><path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z" /><path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z" /></> },
  found: { bg: "bg-sky", icon: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /> },
  agent: { bg: "bg-blue text-cream", icon: <><rect x="5" y="8" width="14" height="11" /><path d="M12 4v4M9 13h.01M15 13h.01" /></> },
  info: { bg: "bg-cream", icon: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></> },
  skip: { bg: "bg-cream", icon: <path d="M6 12h12" /> },
};

export function KindIcon({ kind }: { kind: ActivityKind }) {
  const k = KIND_STYLE[kind];
  return (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink ${k.bg}`}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {k.icon}
      </svg>
    </span>
  );
}

export function SiteChip({ host }: { host: string }) {
  // Show the organisation's domain, not a careers./jobs. subdomain.
  const main = host.replace(/^(careers|jobs|apply|www|en|uk)\./, "");
  return (
    <span className="inline-flex max-w-[150px] items-center gap-1 border border-ink bg-white px-1 font-mono text-[10px]">
      <span className="font-black">{main[0]?.toUpperCase()}</span>
      <span className="truncate">{main}</span>
    </span>
  );
}

export function Counters({ stats, size = "sm" }: { stats: Stats; size?: "sm" | "lg" }) {
  const cells: [string, number][] = [
    ["Searches", stats.searched],
    ["Pages read", stats.read],
    ["Found", stats.found],
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {cells.map(([label, n]) => (
        <div key={label} className={`border-2 border-ink text-center ${label === "Found" ? "bg-sky" : "bg-white"} ${size === "lg" ? "py-3" : "py-1.5"}`}>
          <motion.div
            key={n}
            initial={{ scale: 1.25, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`font-black tracking-[-0.03em] ${size === "lg" ? "text-[34px] leading-none" : "text-xl leading-tight"}`}
          >
            {n}
          </motion.div>
          <div className="eyebrow text-[9px] text-muted">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function ActivityList({ items, max = 6 }: { items: ActivityItem[]; max?: number }) {
  const visible = items.filter((i) => i.kind !== "skip").slice(-max).reverse();
  const skipped = items.filter((i) => i.kind === "skip");
  return (
    <div>
      <ul className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {visible.map((i) => (
            <motion.li
              key={i.id}
              layout
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
              className={`flex items-center gap-2 border-2 border-ink px-2 py-1.5 text-[13px] ${i.kind === "found" ? "bg-sky font-bold" : "bg-white"}`}
            >
              <KindIcon kind={i.kind} />
              <span className="min-w-0 flex-1 truncate" title={i.text}>
                {i.kind === "search" ? (
                  <>
                    Searching for <i>{i.text}</i>
                  </>
                ) : (
                  i.text
                )}
              </span>
              {i.host && i.kind !== "read" && <SiteChip host={i.host} />}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {skipped.length > 0 && (
        <p className="mt-2 text-xs text-muted" title={skipped.map((s) => `${s.host}: ${s.detail ?? ""}`).join("\n")}>
          {skipped.length} page{skipped.length > 1 ? "s" : ""} wouldn&apos;t load, skipped.
        </p>
      )}
    </div>
  );
}

// Sidebar card: which sources are running, combined counters, latest steps.
export function ActivityFeed({ items, stats, running }: { items: ActivityItem[]; stats: Stats; running: Source[] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full border-2 border-ink ${running.length ? "animate-pulse bg-blue" : "bg-sky"}`} />
        <div className="eyebrow text-[11px] text-muted">{running.length ? "TinyFish is working" : "All caught up"}</div>
      </div>
      {running.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {running.map((s) => (
            <span key={s} className="chip flex items-center gap-1 bg-cream py-0.5 text-[11px]">
              <Spinner /> {SOURCE_LABEL[s]}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3">
        <Counters stats={stats} />
      </div>
      <div className="mt-3">
        {items.length === 0 ? <p className="text-sm text-muted">Every search and page TinyFish reads shows up here.</p> : <ActivityList items={items} max={5} />}
      </div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <motion.span
      aria-hidden="true"
      className={`inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent ${className}`}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    />
  );
}
