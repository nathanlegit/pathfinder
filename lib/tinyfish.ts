// Thin server-side wrappers around the TinyFish REST API.
// Shapes follow https://docs.tinyfish.ai (search-api, fetch-api, agent-api, monitor references).
// Never import this from client components: it reads the API key.

const SEARCH_URL = "https://api.search.tinyfish.ai";
const FETCH_URL = "https://api.fetch.tinyfish.ai";
const AGENT_BASE = "https://agent.tinyfish.ai";

function apiKey(): string {
  const key = process.env.TINYFISH_API_KEY;
  if (!key) throw new Error("TINYFISH_API_KEY is not set");
  return key;
}

async function request<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "X-API-Key": apiKey(), "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TinyFish ${res.status} ${url}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---------- Search ----------

export type SearchResult = {
  position: number;
  site_name: string;
  title: string;
  snippet: string;
  url: string;
  date?: string;
};

export async function search(
  query: string,
  opts: { location?: string; purpose?: string } = {},
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    query,
    location: opts.location ?? "GB",
    language: "en",
  });
  if (opts.purpose) params.set("purpose", opts.purpose);
  const data = await request<{ results: SearchResult[] }>(
    `${SEARCH_URL}?${params}`,
    { method: "GET" },
    15_000,
  );
  return data.results ?? [];
}

// ---------- Fetch ----------

export type FetchedPage = {
  url: string;
  final_url: string;
  title: string | null;
  description: string | null;
  text: string | null;
};

export type FetchError = { url: string; error: string; status?: number };

// Fetch up to 10 URLs per call (API limit) as markdown.
export async function fetchPages(
  urls: string[],
  purpose?: string,
): Promise<{ results: FetchedPage[]; errors: FetchError[] }> {
  const data = await request<{ results: FetchedPage[]; errors: FetchError[] }>(
    FETCH_URL,
    {
      method: "POST",
      body: JSON.stringify({
        urls: urls.slice(0, 10),
        format: "markdown",
        purpose,
        per_url_timeout_ms: 45_000,
      }),
    },
    150_000,
  );
  return { results: data.results ?? [], errors: data.errors ?? [] };
}

// ---------- Agent ----------

export type AgentRun = {
  run_id: string | null;
  status: "COMPLETED" | "FAILED";
  result: unknown;
  error: unknown;
};

// Synchronous agent run (blocks 15-60s). COMPLETED does not mean the goal succeeded:
// callers must check `result`.
export async function runAgent(
  url: string,
  goal: string,
  outputSchema?: object,
): Promise<AgentRun> {
  return request<AgentRun>(
    `${AGENT_BASE}/v1/automation/run`,
    {
      method: "POST",
      body: JSON.stringify({ url, goal, output_schema: outputSchema, browser_profile: "lite" }),
    },
    120_000,
  );
}

// ---------- Monitor ----------

export type MonitorRun = {
  id: string;
  is_baseline?: boolean;
  results: { url: string; text: string | null }[];
  errors: FetchError[];
};

export async function createMonitor(
  url: string,
  name: string,
  purpose: string,
): Promise<{ id: string; baseline: MonitorRun | undefined }> {
  // The 201 response carries the monitor plus its baseline run. Field naming of the
  // baseline is read defensively since the docs list it alongside the monitor object.
  const data = await request<Record<string, unknown>>(
    `${AGENT_BASE}/v1/monitors`,
    {
      method: "POST",
      body: JSON.stringify({
        type: "fetch",
        name: name.slice(0, 100),
        purpose,
        config: { url, format: "markdown" },
        schedule_cron: "0 8 * * *", // daily, 08:00 UTC
      }),
    },
    150_000,
  );
  const monitor = (data.monitor ?? data) as { id: string };
  const baseline = (data.baseline_run ?? data.baseline ?? data.run) as MonitorRun | undefined;
  return { id: monitor.id, baseline };
}

export async function runMonitorNow(id: string): Promise<MonitorRun> {
  const data = await request<Record<string, unknown>>(
    `${AGENT_BASE}/v1/monitors/${encodeURIComponent(id)}/runs`,
    { method: "POST" },
    150_000,
  );
  return (data.run ?? data) as MonitorRun;
}

export async function deleteMonitor(id: string): Promise<void> {
  await fetch(`${AGENT_BASE}/v1/monitors/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-API-Key": apiKey() },
    signal: AbortSignal.timeout(20_000),
  });
}
