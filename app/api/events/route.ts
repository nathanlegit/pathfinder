// POST a Profile; streams NDJSON ProgressEvents while finding upcoming Luma events.

import { runEvents } from "@/lib/events";
import type { Profile, ProgressEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const missing = ["TINYFISH_API_KEY", "ANTHROPIC_API_KEY"].filter((k) => !process.env[k]);
  if (missing.length) {
    return Response.json({ error: `Missing env vars: ${missing.join(", ")}` }, { status: 500 });
  }

  const profile = (await req.json()) as Profile;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ProgressEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runEvents(profile, emit);
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      }
      emit({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
