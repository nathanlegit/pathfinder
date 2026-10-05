// TinyFish Monitor endpoints for the tracker.
// POST { url, name }          -> create a daily page monitor; returns { id, hash } of the baseline
// POST { action: "check", id } -> run the monitor now; returns { hash } to compare with the baseline
// DELETE { id }                -> delete the monitor
// The REST API has no run-history endpoint, so "changed" is decided by comparing content hashes.
// Full diffs and email alerts live in the TinyFish dashboard.

import { createHash } from "node:crypto";
import { createMonitor, deleteMonitor, runMonitorNow, type MonitorRun } from "@/lib/tinyfish";

export const runtime = "nodejs";
export const maxDuration = 300;

function hashRun(run: MonitorRun | undefined): string | null {
  const text = (run?.results ?? []).map((r) => (typeof r.text === "string" ? r.text : JSON.stringify(r.text))).join("\n");
  return text ? createHash("sha256").update(text).digest("hex").slice(0, 16) : null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; id?: string; url?: string; name?: string };
    if (body.action === "check" && body.id) {
      const run = await runMonitorNow(body.id);
      return Response.json({ hash: hashRun(run), errors: run.errors ?? [] });
    }
    if (!body.url) return Response.json({ error: "url required" }, { status: 400 });
    const { id, baseline } = await createMonitor(
      body.url,
      `Pathfinder: ${body.name ?? body.url}`,
      "Alert when the application status, deadline, eligibility or dates of this early-careers programme change.",
    );
    return Response.json({ id, hash: hashRun(baseline) });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = (await req.json()) as { id: string };
    await deleteMonitor(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
