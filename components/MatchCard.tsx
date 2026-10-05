"use client";

import { daysUntil } from "@/lib/tracker";
import type { Opportunity } from "@/lib/types";

export function fitLabel(score: number) {
  return score >= 70 ? "Strong match" : score >= 45 ? "Good match" : "Stretch pick";
}

// Short human deadline, e.g. "Closes in 9 days", "Rolling", "Closed".
export function deadlineLabel(deadline: string, status?: string) {
  if (status === "closed") return "Closed";
  const days = daysUntil(deadline);
  if (days === null) return deadline === "rolling" ? "Rolling" : status === "opening soon" ? "Opening soon" : "Deadline TBC";
  if (days < 0) return "Deadline passed";
  if (days === 0) return "Closes today";
  if (days === 1) return "Closes tomorrow";
  if (days <= 60) return `Closes in ${days} days`;
  return `Closes ${new Date(deadline.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

const TYPE_LABEL: Record<string, string> = {
  "spring week": "Spring week",
  internship: "Internship",
  "insight day": "Insight day",
  other: "Opportunity",
};

export function MatchCard({
  o,
  hero,
  saved,
  onSave,
  onHide,
}: {
  o: Opportunity;
  hero: boolean;
  saved: boolean;
  onSave: () => void;
  onHide: () => void;
}) {
  const host = (() => {
    try {
      return new URL(o.source_url).hostname.replace(/^www\./, "");
    } catch {
      return "source";
    }
  })();

  return (
    <article
      className={`border-2 border-ink p-6 sm:p-7 ${hero ? "bg-blue text-cream shadow-[8px_8px_0_#111]" : "bg-white text-ink shadow-[6px_6px_0_#111]"}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={`chip font-extrabold ${hero ? "bg-sky text-ink" : "bg-blue text-cream"}`}>
          {fitLabel(o.score)} · {o.score}
        </span>
        <span className="eyebrow text-[11px] tracking-[0.12em]">
          {TYPE_LABEL[o.type] ?? o.type}
          {o.location && o.location !== "unknown" ? ` · ${o.location}` : ""}
        </span>
        <span className="ml-auto border-2 border-ink bg-cream px-2.5 py-1 text-[13px] font-extrabold text-ink">
          {deadlineLabel(o.deadline, o.status)}
        </span>
      </div>
      <h2 className="mt-4 mb-1 text-[clamp(24px,3vw,30px)] leading-[1.05] font-black tracking-[-0.03em]">{o.programme_name}</h2>
      <div className="text-[15px] font-semibold opacity-85">
        {o.firm}
        {o.eligibility && o.eligibility !== "unknown" ? ` · ${o.eligibility}` : ""}
      </div>
      <div className={`mt-4 border-2 px-4 py-3.5 text-[15px] leading-normal ${hero ? "border-cream" : "border-ink bg-cream"}`}>
        <b>Why you:</b> {o.reason}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <a
          href={o.source_url}
          target="_blank"
          rel="noreferrer"
          className={`btn press ${hero ? "btn-cream shadow-[3px_3px_0_#111]" : "btn-ink"}`}
        >
          Apply →
        </a>
        <button type="button" onClick={onSave} disabled={saved} className="btn btn-cream press disabled:opacity-100">
          {saved ? "★ Saved" : "☆ Save"}
        </button>
        <button type="button" onClick={onHide} className="cursor-pointer px-2 py-3 text-sm font-bold underline">
          Not for me
        </button>
        <span className={`ml-auto font-mono text-[11px] ${hero ? "text-sky" : "text-muted"}`}>
          {o.via === "agent" ? "via TinyFish Agent · " : ""}
          {host}
        </span>
      </div>
    </article>
  );
}
