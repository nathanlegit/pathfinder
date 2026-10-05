"use client";

import { useState } from "react";
import { ProfileForm } from "@/components/ProfileForm";
import { ProgressLog } from "@/components/ProgressLog";
import { OpportunitiesTable } from "@/components/OpportunitiesTable";
import type { Opportunity, Profile, ProgressEvent } from "@/lib/types";

const EMPTY_PROFILE: Profile = {
  university: "",
  degree: "",
  yearOfStudy: "1st year",
  interests: "",
  targetPaths: [],
  locations: "London, UK",
  experience: "",
};

export default function Home() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [queries, setQueries] = useState<string[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Streams NDJSON progress events from /api/map and applies each to state.
  async function mapMyPath() {
    setRunning(true);
    setLog([]);
    setQueries([]);
    setError(null);
    try {
      const res = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ProgressEvent;
          if (event.type === "log") setLog((l) => [...l, event.message]);
          else if (event.type === "queries") setQueries(event.queries);
          else if (event.type === "results") setOpportunities(event.opportunities);
          else if (event.type === "error") setError(event.message);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Pathfinder</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Live spring weeks and internships, found on the open web by TinyFish and ranked for you.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
            <ProfileForm profile={profile} onChange={setProfile} onSubmit={mapMyPath} running={running} />
          </section>
        </aside>

        <section className="min-w-0 space-y-6">
          <ProgressLog lines={log} queries={queries} />
          <div>
            <h2 className="mb-3 text-sm font-medium text-zinc-300">
              Opportunities {opportunities.length > 0 && <span className="text-zinc-500">({opportunities.length})</span>}
            </h2>
            <OpportunitiesTable rows={opportunities} />
          </div>
        </section>
      </div>
    </main>
  );
}
