// POST multipart form with a "file" PDF; returns { text } extracted from the CV.

import { extractText, getDocumentProxy } from "unpdf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 });
    if (file.size > 5_000_000) return Response.json({ error: "PDF too large (max 5 MB)" }, { status: 400 });
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    return Response.json({ text: text.trim().slice(0, 12_000) });
  } catch (err) {
    return Response.json({ error: `Could not read PDF: ${(err as Error).message}` }, { status: 400 });
  }
}
