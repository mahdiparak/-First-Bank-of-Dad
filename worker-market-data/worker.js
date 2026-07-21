// Public market-data feeder for the Investment Sandbox.
//
// This is intentionally separate from the E2EE sync relay: it only ever
// handles public market prices (S&P 500 / BTC), never a family's private
// financial data, so it does not need to be blind or encrypted. A daily
// Cron Trigger fetches the latest close, merges it into a rolling history
// window in KV, and clients read that window to calibrate the mock market
// engine's realistic volatility (bootstrap-sampled real returns, not a
// literal live balance).
//
// Stock data source defaults to Stooq (free, no key). The Parent Command
// Center can POST an Alpha Vantage API key via /admin/config to switch to
// the official, documented feed; if a configured Alpha Vantage call fails
// (bad/rate-limited key), the fetch falls back to Stooq automatically.

const HISTORY_DAYS = 730;
// CoinGecko's free/public API caps historical queries at 365 days and reserves the
// `interval` parameter for paid plans — asking for more than either returns an error,
// not a truncated result. The rolling KV window still grows past 365 days over time.
const CRYPTO_FETCH_DAYS = 365;
const STOCK_SYMBOL_STOOQ = 'spy.us';
const STOCK_SYMBOL_ALPHA = 'SPY';
const CRYPTO_COINGECKO_ID = 'bitcoin';

const KV_KEY_CONFIG = 'config';
const KV_KEY_STOCK_HISTORY = 'history:stocks';
const KV_KEY_CRYPTO_HISTORY = 'history:crypto';
const KV_KEY_META = 'meta';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function getConfig(env) {
  return (await env.MARKET_KV.get(KV_KEY_CONFIG, 'json')) || {};
}

// Several of these free feeds rate-limit or bot-block datacenter IPs (which is what a
// Cloudflare Worker egresses from) while still answering HTTP 200 with an error body —
// so every fetcher must treat "no usable rows" as a failure, or a blocked source would
// silently overwrite good history with nothing.
function assertPoints(points, sourceName) {
  if (points.length === 0) throw new Error(`${sourceName} returned no usable data (likely rate-limited or blocked)`);
  return points;
}

async function fetchStooqDaily() {
  const res = await fetch(`https://stooq.com/q/d/l/?s=${STOCK_SYMBOL_STOOQ}&i=d`);
  if (!res.ok) throw new Error(`Stooq request failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.trim().split('\n').slice(1); // drop header row
  const points = [];
  for (const line of lines) {
    const [date, , , , close] = line.split(',');
    const value = Number(close);
    if (date && Number.isFinite(value)) {
      points.push({ date, close: value });
    }
  }
  return assertPoints(points, 'Stooq');
}

async function fetchYahooDaily() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${STOCK_SYMBOL_ALPHA}?range=2y&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (FirstBankOfDad market feeder)' } });
  if (!res.ok) throw new Error(`Yahoo request failed: ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = Number(closes[i]);
    if (Number.isFinite(close)) {
      points.push({ date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10), close });
    }
  }
  return assertPoints(points, 'Yahoo');
}

async function fetchAlphaVantageDaily(apiKey) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${STOCK_SYMBOL_ALPHA}&outputsize=compact&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status}`);
  const json = await res.json();
  const series = json['Time Series (Daily)'];
  if (!series) {
    throw new Error(json['Note'] || json['Error Message'] || 'Alpha Vantage returned no data');
  }
  return Object.entries(series)
    .map(([date, values]) => ({ date, close: Number(values['4. close']) }))
    .filter((point) => Number.isFinite(point.close));
}

async function fetchCoinGeckoDaily() {
  const url = `https://api.coingecko.com/api/v3/coins/${CRYPTO_COINGECKO_ID}/market_chart?vs_currency=usd&days=${CRYPTO_FETCH_DAYS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  const json = await res.json();
  const points = (json.prices || [])
    .map(([timestampMs, price]) => ({
      date: new Date(timestampMs).toISOString().slice(0, 10),
      close: Number(price),
    }))
    .filter((point) => Number.isFinite(point.close));
  return assertPoints(points, 'CoinGecko');
}

async function fetchKrakenDaily() {
  // Kraken's public OHLC endpoint returns ~720 daily candles, no auth, and is
  // reliably reachable from Workers — the fallback when CoinGecko bot-blocks us.
  const res = await fetch('https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440');
  if (!res.ok) throw new Error(`Kraken request failed: ${res.status}`);
  const json = await res.json();
  if (json.error?.length) throw new Error(`Kraken error: ${json.error.join('; ')}`);
  const series = Object.values(json.result || {}).find(Array.isArray) || [];
  const points = [];
  for (const candle of series) {
    const close = Number(candle?.[4]);
    if (Number.isFinite(close)) {
      points.push({ date: new Date(candle[0] * 1000).toISOString().slice(0, 10), close });
    }
  }
  return assertPoints(points, 'Kraken');
}

function mergeHistory(existing, incoming) {
  const byDate = new Map(existing.map((point) => [point.date, point.close]));
  for (const point of incoming) {
    byDate.set(point.date, point.close);
  }
  return Array.from(byDate.entries())
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-HISTORY_DAYS);
}

// Tries each provider in order until one yields data. Every failure along the way is
// reported — even when a later fallback succeeded — so "stooq is blocking us and we're
// coasting on yahoo" is visible instead of silent.
async function fetchWithFallbacks(providers) {
  const failures = [];
  for (const [name, fetcher] of providers) {
    try {
      const points = await fetcher();
      return { points, provider: name, error: failures.length > 0 ? failures.join(' | ') : undefined };
    } catch (error) {
      failures.push(`${name}: ${error?.message || error}`);
    }
  }
  return { points: null, provider: null, error: failures.join(' | ') };
}

// One data source failing must never sink the other (or the whole request): each
// feed runs its own provider-fallback chain independently, whatever succeeded is
// saved, and per-source errors are reported back / recorded in meta instead of thrown.
async function refreshMarketData(env) {
  const config = await getConfig(env);
  const errors = {};

  const stockProviders = [];
  if (config.alphaVantageApiKey) {
    stockProviders.push(['alphavantage', () => fetchAlphaVantageDaily(config.alphaVantageApiKey)]);
  }
  stockProviders.push(['stooq', fetchStooqDaily], ['yahoo', fetchYahooDaily]);
  const stockResult = await fetchWithFallbacks(stockProviders);
  const stockPoints = stockResult.points;
  const stockProvider = stockResult.provider;
  if (stockResult.error) errors.stocks = stockResult.error;

  const cryptoResult = await fetchWithFallbacks([
    ['coingecko', fetchCoinGeckoDaily],
    ['kraken', fetchKrakenDaily],
  ]);
  const cryptoPoints = cryptoResult.points;
  if (cryptoResult.error) errors.crypto = cryptoResult.error;

  const [existingStocks, existingCrypto, existingMeta] = await Promise.all([
    env.MARKET_KV.get(KV_KEY_STOCK_HISTORY, 'json'),
    env.MARKET_KV.get(KV_KEY_CRYPTO_HISTORY, 'json'),
    env.MARKET_KV.get(KV_KEY_META, 'json'),
  ]);

  const mergedStocks = stockPoints ? mergeHistory(existingStocks || [], stockPoints) : existingStocks || [];
  const mergedCrypto = cryptoPoints ? mergeHistory(existingCrypto || [], cryptoPoints) : existingCrypto || [];

  const writes = [
    env.MARKET_KV.put(
      KV_KEY_META,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        stockProvider: stockProvider ?? existingMeta?.stockProvider ?? null,
        lastErrors: Object.keys(errors).length > 0 ? errors : undefined,
      })
    ),
  ];
  if (stockPoints) writes.push(env.MARKET_KV.put(KV_KEY_STOCK_HISTORY, JSON.stringify(mergedStocks)));
  if (cryptoPoints) writes.push(env.MARKET_KV.put(KV_KEY_CRYPTO_HISTORY, JSON.stringify(mergedCrypto)));
  await Promise.all(writes);

  return {
    stockProvider,
    stockPoints: mergedStocks.length,
    cryptoPoints: mergedCrypto.length,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
}

function isAuthorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(token && env.ADMIN_TOKEN && token === env.ADMIN_TOKEN);
}

export default {
  async fetch(request, env) {
    // Any uncaught exception would surface as a Cloudflare error page with no CORS
    // headers, which browsers report as an opaque "Failed to fetch" — so every
    // failure gets converted into a JSON error response the client can display.
    try {
      return await handleRequest(request, env);
    } catch (error) {
      return jsonResponse({ error: String(error?.message || error) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(refreshMarketData(env));
  },
};

async function handleRequest(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === '/market-data' && request.method === 'GET') {
      const [stocks, crypto, meta] = await Promise.all([
        env.MARKET_KV.get(KV_KEY_STOCK_HISTORY, 'json'),
        env.MARKET_KV.get(KV_KEY_CRYPTO_HISTORY, 'json'),
        env.MARKET_KV.get(KV_KEY_META, 'json'),
      ]);

      return jsonResponse({
        updatedAt: meta?.updatedAt ?? null,
        stockProvider: meta?.stockProvider ?? null,
        // Surfaced so the app can show WHY a feed is empty without needing the admin token.
        lastErrors: meta?.lastErrors ?? null,
        stocks: stocks || [],
        crypto: crypto || [],
      });
    }

    if (url.pathname === '/admin/config' && request.method === 'POST') {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON' }, 400);
      }

      const config = await getConfig(env);
      if (typeof body.alphaVantageApiKey === 'string') {
        config.alphaVantageApiKey = body.alphaVantageApiKey.trim() || undefined;
      }
      await env.MARKET_KV.put(KV_KEY_CONFIG, JSON.stringify(config));

      return jsonResponse({ ok: true });
    }

    if (url.pathname === '/admin/refresh' && request.method === 'POST') {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const summary = await refreshMarketData(env);
      return jsonResponse({ ok: true, ...summary });
    }

    return jsonResponse({ error: 'Not found' }, 404);
}
