// POST { profile, topOpportunities }; streams NDJSON progress, then people found on public pages.

import { runPeople } from "@/lib/discover";
import type { Profile, ProgressEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { profile, topOpportunities } = (await req.json()) as { profile: Profile; topOpportunities: string[] };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ProgressEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPeople(profile, topOpportunities ?? [], emit);
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      }
      emit({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
