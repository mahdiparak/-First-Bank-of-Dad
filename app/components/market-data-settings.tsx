"use client";

import { useEffect, useState } from "react";
import { loadMarketData, type MarketDataResponse } from "@/lib/market-data";
import { setAlphaVantageApiKey, triggerMarketDataRefresh } from "@/lib/market-admin";
import {
  loadAlphaVantageApiKey,
  loadMarketDataAdminToken,
  saveAlphaVantageApiKey,
  saveMarketDataAdminToken,
} from "@/lib/storage";
import { InfoTooltip } from "./info-tooltip";
import { RevealInput } from "./reveal-input";

const inputClass =
  "rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

const MARKET_DATA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_MARKET_DATA_URL);
const MARKET_DATA_URL = process.env.NEXT_PUBLIC_MARKET_DATA_URL ?? "";

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
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    void loadMarketDataAdminToken().then((token) => {
      if (token) setAdminToken(token);
    });
    void loadAlphaVantageApiKey().then((key) => {
      if (key) setApiKey(key);
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

  function handleAdminTokenChange(value: string) {
    setAdminToken(value);
    void saveMarketDataAdminToken(value || null);
  }

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    void saveAlphaVantageApiKey(value || null);
  }

  async function withToken(action: (token: string) => Promise<void>) {
    if (!adminToken.trim()) {
      setError("Enter the admin token first — see the ⓘ next to it for how to set one up.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action(adminToken.trim());
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
    });
  }

  async function handleRefreshNow() {
    await withToken(async (token) => {
      const summary = await triggerMarketDataRefresh(token);
      const fresh = await loadMarketData({ force: true });
      onMarketDataRefreshed(fresh);
      const parts = [
        `stocks: ${summary.stockPoints ?? 0} points${summary.stockProvider ? ` (${summary.stockProvider})` : ""}`,
        `crypto: ${summary.cryptoPoints ?? 0} points`,
      ];
      if (summary.errors?.stocks) parts.push(`⚠️ stocks error: ${summary.errors.stocks}`);
      if (summary.errors?.crypto) parts.push(`⚠️ crypto error: ${summary.errors.crypto}`);
      setMessage(`Refreshed — ${parts.join(" · ")}`);
    });
  }

  /**
   * Distinguishes the failure modes a bare "Failed to fetch" hides: a network/CORS-level
   * failure (wrong URL, Worker not deployed, or an Access login page intercepting the call)
   * vs. an HTTP error vs. actually working.
   */
  async function handleTestConnection() {
    setTestResult("Testing…");
    try {
      const res = await fetch(MARKET_DATA_URL);
      if (!res.ok) {
        setTestResult(
          `Reached the server but got HTTP ${res.status}. The Worker is running — check that the URL ends with /market-data.`,
        );
        return;
      }
      const data = (await res.json()) as { stocks?: unknown[]; crypto?: unknown[] };
      setTestResult(
        `✅ Connected — ${data.stocks?.length ?? 0} stock points, ${data.crypto?.length ?? 0} crypto points stored.`,
      );
    } catch {
      setTestResult(
        "❌ The browser couldn't reach this URL at all (not even an error page). Usual causes: a typo in the URL, the Worker isn't deployed, its workers.dev route is disabled, or Cloudflare Access is protecting the Worker and intercepting the request with a login page. Open the URL below directly in a new browser tab to see which one it is.",
      );
    }
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

      <div className="space-y-1 rounded-lg border border-black/10 p-2 dark:border-white/10">
        <p className="text-xs opacity-70">Feed URL (from this build&apos;s NEXT_PUBLIC_MARKET_DATA_URL):</p>
        <a href={MARKET_DATA_URL} target="_blank" rel="noreferrer" className="break-all text-xs underline opacity-80">
          {MARKET_DATA_URL}
        </a>
        <div>
          <button
            type="button"
            onClick={() => void handleTestConnection()}
            className="rounded-md border border-black/20 px-2 py-1 text-xs dark:border-white/20"
          >
            Test connection
          </button>
        </div>
        {testResult && <p className="text-xs opacity-80">{testResult}</p>}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {message && <p className="text-xs opacity-60">{message}</p>}

      <label className="flex flex-col gap-1 text-xs opacity-70">
        <span className="flex items-center">
          Admin token
          <InfoTooltip label="Where do I get an admin token?">
            <p>
              This must exactly match the <strong>ADMIN_TOKEN</strong> secret on your
              market-data Worker — it&apos;s not something Cloudflare generates for you, you make
              it up yourself.
            </p>
            <p>To set it from your phone (no CLI needed):</p>
            <p>1. Open the Cloudflare dashboard → Workers &amp; Pages.</p>
            <p>2. Open the market-data Worker → Settings → Variables and Secrets.</p>
            <p>3. Add a secret named exactly <strong>ADMIN_TOKEN</strong>, type any password you choose, and save (this redeploys the Worker).</p>
            <p>4. Enter that same value below.</p>
          </InfoTooltip>
        </span>
        <RevealInput value={adminToken} onChange={handleAdminTokenChange} placeholder="Admin token" className={inputClass} />
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
          <RevealInput value={apiKey} onChange={handleApiKeyChange} placeholder="Alpha Vantage API key" className={inputClass} />
          <button type="submit" disabled={busy} className="rounded-md bg-black px-3 py-2 text-sm text-white dark:bg-white dark:text-black">
            Save key
          </button>
        </div>
        <p className="text-xs opacity-50">Kept on this device so the field never comes back empty — toggle 👁️ to double-check what&apos;s saved.</p>
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
