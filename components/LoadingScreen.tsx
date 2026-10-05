"use client";

// Full-width loading screen shown while the first matches are being found.
// A 4-step stepper with a progress bar, live counters, a stack of discoveries as they land,
// the search plan, and rotating tips. It disappears the moment the first results arrive.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ActivityList, Counters, type ActivityItem, type Stats } from "./ActivityFeed";
import type { Stage } from "@/lib/types";

const STEPS: { id: Stage; label: string; blurb: string }[] = [
  { id: "plan", label: "Plan", blurb: "Turning your profile into searches" },
  { id: "search", label: "Search", blurb: "Searching the live web" },
  { id: "read", label: "Read", blurb: "Reading careers pages" },
  { id: "match", label: "Match", blurb: "Matching them to you" },
];

const TIPS = [
  "Every match links to the real page it came from.",
  "Hit ☆ Save, then Watch: TinyFish re-checks the page every day.",
  "Events, courses and research are loading in the other tabs too.",
  "Deadlines you save land on your Deadlines timeline.",
  "Not for you? “Not for me” clears it from your feed.",
];

const ROTATIONS = [-3, 2, -1.5, 3, -2.5, 1];

export function LoadingScreen({
  name,
  stage,
  stats,
  queries,
  items,
  candidates,
}: {
  name: string;
  stage: Stage;
  stats: Stats;
  queries: string[];
  items: ActivityItem[];
  candidates: number;
}) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 4000);
    return () => clearInterval(t);
  }, []);

  const stepIndex = Math.max(0, STEPS.findIndex((s) => s.id === stage));
  // Progress: each step is a quarter; within "read", advance by pages read.
  const within = stage === "read" && candidates ? Math.min(1, stats.read / candidates) : stage === "search" ? Math.min(1, stats.searched / Math.max(queries.length, 1)) : 0.5;
  const progress = Math.min(0.97, (stepIndex + within) / STEPS.length);
  const finds = items.filter((i) => i.kind === "found").slice(-5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col gap-10"
    >
      {/* Headline + stepper */}
      <div>
        <div className="eyebrow tracking-[0.16em] text-blue">
          Step {stepIndex + 1} of 4 · {STEPS[stepIndex].blurb}
        </div>
        <h1 className="mt-2.5 text-[clamp(40px,6vw,84px)] leading-[0.92] font-black tracking-[-0.05em]">
          Hunting for <span className="hl">{name}</span>
          <Dots />
        </h1>
        <ol className="mt-8 grid grid-cols-4 gap-2 sm:gap-3">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li
                key={s.id}
                className={`eyebrow flex items-center justify-center gap-2 border-2 border-ink px-2 py-3 text-[11px] transition-colors duration-300 sm:text-[12px] ${
                  done ? "bg-ink text-cream" : active ? "bg-blue text-cream shadow-[4px_4px_0_#111]" : "bg-white text-ink"
                }`}
              >
                {done ? "✓" : active ? <PulseDot /> : <span className="opacity-40">{i + 1}</span>}
                {s.label}
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-4 border-2 border-ink bg-white">
          <motion.div className="h-full bg-blue" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-10">
        {/* Discoveries stack */}
        <div className="min-w-0 flex-[1_1_360px]">
          <div className="eyebrow mb-4 text-[11px] text-muted">Just found</div>
          <div className="relative h-[260px]">
            <AnimatePresence>
              {finds.length === 0 ? (
                <motion.div
                  key="empty"
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-0 top-0 flex h-[180px] items-center justify-center border-2 border-dashed border-ink bg-sand text-center font-bold"
                >
                  First discoveries land here in a few seconds…
                </motion.div>
              ) : (
                finds.map((f, i) => {
                  const depth = finds.length - 1 - i; // 0 = newest, on top
                  const [org, ...rest] = f.text.split(" · ");
                  return (
                    <motion.div
                      key={f.id}
                      initial={{ opacity: 0, y: -40, rotate: 0, scale: 0.9 }}
                      animate={{ opacity: depth > 3 ? 0 : 1, y: depth * 16, rotate: ROTATIONS[f.id % ROTATIONS.length], scale: 1 - depth * 0.04 }}
                      transition={{ type: "spring", stiffness: 260, damping: 22 }}
                      style={{ zIndex: 10 - depth }}
                      className={`absolute inset-x-0 top-0 border-2 border-ink p-5 shadow-[6px_6px_0_#111] ${depth === 0 ? "bg-blue text-cream" : "bg-white"}`}
                    >
                      <div className="eyebrow text-[10px] opacity-80">Found{f.host ? ` on ${f.host}` : ""}</div>
                      <div className="mt-2 truncate text-[24px] leading-tight font-black tracking-[-0.03em]">{rest.join(" · ") || org}</div>
                      <div className="mt-1 truncate font-semibold opacity-85">{rest.length ? org : ""}</div>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Counters + live steps */}
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <Counters stats={stats} size="lg" />
          <ActivityList items={items} max={5} />
        </div>
      </div>

      {queries.length > 0 && (
        <div>
          <div className="eyebrow mb-3 text-[11px] text-muted">What we&apos;re searching for</div>
          <div className="flex flex-wrap gap-2">
            {queries.map((q, i) => (
              <motion.span
                key={q}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.08 }}
                className="border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold"
              >
                {q}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 border-t-2 border-ink pt-5 text-[15px]">
        <span className="chip shrink-0 bg-sky">Tip</span>
        <AnimatePresence mode="wait">
          <motion.span key={tip} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-body">
            {TIPS[tip]}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Dots() {
  return (
    <span aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} animate={{ opacity: [0.2, 1, 0.2] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}>
          .
        </motion.span>
      ))}
    </span>
  );
}

function PulseDot() {
  return <motion.span className="inline-block h-2 w-2 rounded-full bg-cream" animate={{ scale: [1, 1.6, 1] }} transition={{ repeat: Infinity, duration: 1 }} />;
}
