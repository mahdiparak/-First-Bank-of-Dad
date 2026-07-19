"use client";

import { useEffect, useState } from "react";
import { loadMarketData, type MarketDataResponse } from "@/lib/market-data";
import { setAlphaVantageApiKey, triggerMarketDataRefresh } from "@/lib/market-admin";
import { loadMarketDataAdminToken, saveMarketDataAdminToken } from "@/lib/storage";
import { InfoTooltip } from "./info-tooltip";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

const MARKET_DATA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_MARKET_DATA_URL);

export function MarketDataSettings({
  marketData,
  onMarketDataRefreshed,
}: {
  marketData: MarketDataResponse | null;
  onMarketDataRefreshed: (data: MarketDataResponse | null) => void;
}) {
  const [adminToken, setAdminToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMarketDataAdminToken().then((token) => {
      if (token) setAdminToken(token);
    });
  }, []);

  if (!MARKET_DATA_CONFIGURED) {
    return (
      <section className="space-y-2 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-semibold">Market Data</h2>
        <p className="text-sm opacity-70">
          NEXT_PUBLIC_MARKET_DATA_URL isn&apos;t set for this build, so the Investment Sandbox is
          using a synthetic fallback distribution instead of real historical data.
        </p>
      </section>
    );
  }

  async function withToken(action: (token: string) => Promise<void>) {
    if (!adminToken.trim()) {
      setError("Enter the admin token first (set via `wrangler secret put ADMIN_TOKEN`).");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action(adminToken.trim());
      await saveMarketDataAdminToken(adminToken.trim());
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveApiKey(event: React.FormEvent) {
    event.preventDefault();
    await withToken(async (token) => {
      await setAlphaVantageApiKey(token, apiKey.trim());
      setMessage(apiKey.trim() ? "Alpha Vantage key saved — Stocks data upgrades on the next refresh." : "Alpha Vantage key cleared — back to Stooq.");
      setApiKey("");
    });
  }

  async function handleRefreshNow() {
    await withToken(async (token) => {
      await triggerMarketDataRefresh(token);
      const fresh = await loadMarketData({ force: true });
      onMarketDataRefreshed(fresh);
      setMessage("Market data refreshed.");
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <h2 className="font-semibold">Market Data</h2>
      <p className="text-xs opacity-60">
        Stocks default to the free Stooq feed with no setup. Add a free Alpha Vantage key here to
        switch to their official feed — it falls back to Stooq automatically if the key ever fails.
      </p>

      <div className="text-xs opacity-70">
        {marketData?.updatedAt ? (
          <>
            Last updated {new Date(marketData.updatedAt).toLocaleString()} · provider: {marketData.stockProvider ?? "unknown"}
          </>
        ) : (
          "No market data loaded yet."
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-xs opacity-60">{message}</p>}

      <label className="flex flex-col gap-1 text-xs opacity-70">
        Admin token (from `wrangler secret put ADMIN_TOKEN`)
        <input
          value={adminToken}
          onChange={(event) => setAdminToken(event.target.value)}
          type="password"
          placeholder="Admin token"
          className={inputClass}
        />
      </label>

      <form onSubmit={handleSaveApiKey} className="space-y-2">
        <div className="flex items-center text-xs opacity-70">
          Alpha Vantage API key
          <InfoTooltip label="How do I get an Alpha Vantage API key?">
            <p>1. Go to alphavantage.co/support/#api-key.</p>
            <p>2. Enter your email — it&apos;s free, no credit card needed.</p>
            <p>3. Copy the key it shows you (also emailed to you).</p>
            <p>4. Paste it below and tap &quot;Save key.&quot;</p>
          </InfoTooltip>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            type="password"
            placeholder="Alpha Vantage API key"
            className={`${inputClass} flex-1`}
          />
          <button type="submit" disabled={busy} className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
            Save key
          </button>
        </div>
      </form>

      <button
        type="button"
        onClick={() => void handleRefreshNow()}
        disabled={busy}
        className="rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20"
      >
        Refresh market data now
      </button>
    </section>
  );
}
