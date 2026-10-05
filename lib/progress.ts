// Turns pipeline steps into friendly, structured progress events for the UI.
// Raw error text never goes in `text`; it rides along in `detail` for a tooltip.

import type { ActivityKind, ProgressEvent, Stage } from "./types";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type Reporter = ReturnType<typeof reporter>;

export function reporter(emit: (e: ProgressEvent) => void) {
  const stats = { searched: 0, read: 0, found: 0 };
  const act = (kind: ActivityKind, text: string, url?: string, detail?: string) =>
    emit({ type: "activity", kind, text, host: url ? hostOf(url) : undefined, detail });
  const pushStats = () => emit({ type: "stats", ...stats });

  return {
    stage: (stage: Stage) => emit({ type: "stage", stage }),
    info: (text: string) => act("info", text),
    search: (query: string) => act("search", query),
    searched: () => {
      stats.searched++;
      pushStats();
    },
    read: (url: string) => {
      stats.read++;
      act("read", `Reading ${hostOf(url)}`, url);
      pushStats();
    },
    found: (text: string, url?: string, count = 1) => {
      stats.found += count;
      act("found", text, url);
      pushStats();
    },
    skip: (url: string, reason?: string) => act("skip", `Skipped a page that wouldn't load`, url, reason),
    agent: (text: string, url?: string) => act("agent", text, url),
  };
}
