// POST a Profile; returns { paths: [{ path, why }] } — career paths Claude thinks fit this person.

import { suggestPaths } from "@/lib/llm";
import { CAREER_PATHS, type Profile } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const profile = (await req.json()) as Profile;
    const catalogue = CAREER_PATHS.flatMap((g) => g.paths);
    const paths = await suggestPaths({ ...profile, targetPaths: [] }, catalogue);
    return Response.json({ paths });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
