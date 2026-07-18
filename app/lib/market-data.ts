import localforage from "localforage";

const MARKET_DATA_URL = process.env.NEXT_PUBLIC_MARKET_DATA_URL ?? "";
const CACHE_KEY = "market-data-cache";
const CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // the Worker's Cron only refreshes once a day anyway

const cacheStore = localforage.createInstance({ name: "first-bank-of-dad", storeName: "market-data" });

export interface PricePoint {
  date: string;
  close: number;
}

export interface MarketDataResponse {
  updatedAt: string | null;
  stockProvider: string | null;
  stocks: PricePoint[];
  crypto: PricePoint[];
}

interface CacheEntry {
  fetchedAt: string;
  data: MarketDataResponse;
}

/** Fetches the public market-data feed (see ../worker-market-data), caching it locally for up to 12h. */
export async function loadMarketData(): Promise<MarketDataResponse | null> {
  const cached = await cacheStore.getItem<CacheEntry>(CACHE_KEY);
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < CACHE_MAX_AGE_MS) {
    return cached.data;
  }

  if (!MARKET_DATA_URL) return cached?.data ?? null;

  try {
    const res = await fetch(MARKET_DATA_URL);
    if (!res.ok) return cached?.data ?? null;
    const data = (await res.json()) as MarketDataResponse;
    await cacheStore.setItem<CacheEntry>(CACHE_KEY, { fetchedAt: new Date().toISOString(), data });
    return data;
  } catch {
    return cached?.data ?? null;
  }
}

/** Reduces daily closes to month-over-month % returns, e.g. [0.012, -0.034, ...]. */
export function monthlyReturns(history: PricePoint[]): number[] {
  const lastCloseByMonth = new Map<string, number>();
  for (const point of history) {
    lastCloseByMonth.set(point.date.slice(0, 7), point.close); // later entries overwrite, leaving the month's last close
  }
  const closes = Array.from(lastCloseByMonth.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, close]) => close);

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return returns;
}

// Used only when live market data hasn't loaded yet (offline first run) — a rough stand-in
// distribution so the sandbox still works, replaced by real historical returns once fetched.
export const FALLBACK_MONTHLY_RETURNS: Record<"stocks" | "crypto", number[]> = {
  stocks: [0.02, 0.015, -0.03, 0.04, 0.01, -0.015, 0.025, 0.005, -0.02, 0.03, 0.01, -0.01],
  crypto: [0.15, -0.2, 0.3, -0.15, 0.1, 0.25, -0.35, 0.2, -0.1, 0.4, -0.25, 0.05],
};
