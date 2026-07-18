// Talks to the worker-market-data Worker's admin endpoints (see ../worker-market-data/worker.js).
// These calls carry the parent's ADMIN_TOKEN as a bearer token — never stored in the synced
// FamilyBankState (it would then sit on every kid's device too), only in this device's local,
// unsynced storage alongside the device role (see lib/storage.ts).

const MARKET_DATA_URL = process.env.NEXT_PUBLIC_MARKET_DATA_URL ?? "";

function adminUrl(path: string): string {
  const origin = new URL(MARKET_DATA_URL).origin;
  return `${origin}${path}`;
}

async function postAdmin(path: string, adminToken: string, body?: unknown): Promise<void> {
  if (!MARKET_DATA_URL) throw new Error("Market data isn't configured for this build (NEXT_PUBLIC_MARKET_DATA_URL is unset).");

  const res = await fetch(adminUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Wrong admin token.");
    throw new Error(`Request failed (${res.status}).`);
  }
}

/** Sets (or, passing an empty string, clears) the Alpha Vantage API key the Worker uses for Stocks data. */
export async function setAlphaVantageApiKey(adminToken: string, apiKey: string): Promise<void> {
  await postAdmin("/admin/config", adminToken, { alphaVantageApiKey: apiKey });
}

/** Tells the Worker to fetch fresh market data right now, instead of waiting for its daily Cron Trigger. */
export async function triggerMarketDataRefresh(adminToken: string): Promise<void> {
  await postAdmin("/admin/refresh", adminToken);
}
