// POST { profile, topOpportunities }; streams NDJSON progress, then courses that close the gaps.

import { runCourses } from "@/lib/courses";
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
        await runCourses(profile, topOpportunities ?? [], emit);
      } catch (err) {
        emit({ type: "error", message: (err as Error).message });
      }
      emit({ type: "done" });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
}
