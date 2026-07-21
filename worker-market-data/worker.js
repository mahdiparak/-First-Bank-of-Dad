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
  return points;
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
  return (json.prices || []).map(([timestampMs, price]) => ({
    date: new Date(timestampMs).toISOString().slice(0, 10),
    close: price,
  }));
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

// One data source failing must never sink the other (or the whole request): each
// source is fetched independently, whatever succeeded is saved, and per-source
// errors are reported back / recorded in meta instead of thrown.
async function refreshMarketData(env) {
  const config = await getConfig(env);
  const errors = {};

  let stockPoints = null;
  let stockProvider = null;
  try {
    if (config.alphaVantageApiKey) {
      stockPoints = await fetchAlphaVantageDaily(config.alphaVantageApiKey);
      stockProvider = 'alphavantage';
    } else {
      stockPoints = await fetchStooqDaily();
      stockProvider = 'stooq';
    }
  } catch (primaryError) {
    try {
      stockPoints = await fetchStooqDaily();
      stockProvider = 'stooq-fallback';
    } catch (fallbackError) {
      errors.stocks = `${primaryError?.message || primaryError}; fallback: ${fallbackError?.message || fallbackError}`;
    }
  }

  let cryptoPoints = null;
  try {
    cryptoPoints = await fetchCoinGeckoDaily();
  } catch (cryptoError) {
    errors.crypto = String(cryptoError?.message || cryptoError);
  }

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
