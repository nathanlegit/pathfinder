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
  opts: { location?: string; purpose?: string; includeDomains?: string[] } = {},
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    query,
    location: opts.location ?? "GB",
    language: "en",
  });
  if (opts.purpose) params.set("purpose", opts.purpose);
  if (opts.includeDomains) params.set("include_domains", opts.includeDomains.join(","));
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
  links?: string[];
};

export type FetchError = { url: string; error: string; status?: number };

// Fetch up to 10 URLs per call (API limit) as markdown.
export async function fetchPages(
  urls: string[],
  purpose?: string,
  links = false,
): Promise<{ results: FetchedPage[]; errors: FetchError[] }> {
  const data = await request<{ results: FetchedPage[]; errors: FetchError[] }>(
    FETCH_URL,
    {
      method: "POST",
      body: JSON.stringify({
        urls: urls.slice(0, 10),
        format: "markdown",
        purpose,
        links,
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

// Starts an async agent run and polls GET /v1/runs/{id} until it finishes or `budgetMs` passes,
// then cancels it. COMPLETED does not mean the goal succeeded: callers must check `result`.
export async function runAgent(
  url: string,
  goal: string,
  outputSchema?: object,
  budgetMs = 90_000,
): Promise<AgentRun> {
  const started = await request<{ run_id: string | null; error: unknown }>(
    `${AGENT_BASE}/v1/automation/run-async`,
    {
      method: "POST",
      body: JSON.stringify({
        url,
        goal,
        output_schema: outputSchema,
        browser_profile: "lite",
        agent_config: { max_duration_seconds: Math.floor(budgetMs / 1000) },
      }),
    },
    20_000,
  );
  if (!started.run_id) throw new Error(`agent did not start: ${JSON.stringify(started.error)}`);

  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const run = await request<AgentRun & { status: string }>(
      `${AGENT_BASE}/v1/runs/${started.run_id}`,
      { method: "GET" },
      15_000,
    ).catch(() => null); // a failed poll is retried on the next tick
    if (run && ["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) return run;
  }
  await fetch(`${AGENT_BASE}/v1/runs/${started.run_id}/cancel`, {
    method: "POST",
    headers: { "X-API-Key": apiKey() },
  }).catch(() => {});
  throw new Error(`agent ran out of time after ${budgetMs / 1000}s`);
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
