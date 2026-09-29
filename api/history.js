// Daily bars for the active COMEX copper contract (the month with the most volume
// on CME's quote board). This route does not feed the quote.
//
// CME's public site publishes the live board and a few recent settlements, not a
// year of history. Once the active contract is named (HGZ6 → HGZ26.CMX), the
// daily open/high/low/close series for that same contract is loaded. Those bars
// match CME's settlement report where both exist — Dec 2026 on Sep 22, 2026
// printed a high of 6.9285 on both.

const { QUOTES_URL, parseCmeQuotes } = require('./cme');

const RANGES = { '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y', '2y': '2y' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const MIN = 0.5;
const MAX = 50;
const DEFAULT_CONTRACT = {
  quoteCode: 'HGZ6',
  expirationMonth: 'DEC 2026',
  yahoo: 'HGZ26.CMX',
  delay: ''
};

function dayUTC(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
function round4(n) { return +n.toFixed(4); }

function pointsFromYahoo(body) {
  const result = body && body.chart && body.chart.result && body.chart.result[0];
  if (!result) return null;
  const times = result.timestamp || [];
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  if (!quote) return null;
  const closes = quote.close || [];
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const points = [];
  for (let i = 0; i < times.length; i++) {
    const close = closes[i];
    if (typeof close !== 'number' || !isFinite(close) || close <= MIN || close >= MAX) continue;
    const open = typeof opens[i] === 'number' ? opens[i] : close;
    const high = typeof highs[i] === 'number' ? highs[i] : close;
    const low = typeof lows[i] === 'number' ? lows[i] : close;
    points.push({
      t: dayUTC(times[i]),
      open: round4(open),
      high: round4(Math.max(high, open, close, low)),
      low: round4(Math.min(low, open, close, high)),
      close: round4(close)
    });
  }
  return points.length >= 2 ? points : null;
}

function summarize(points, contract) {
  const named = contract || DEFAULT_CONTRACT;
  const first = points[0];
  const last = points[points.length - 1];
  const change = +(last.close - first.close).toFixed(4);
  const changePct = first.close ? +((change / first.close) * 100).toFixed(2) : 0;
  let low = Infinity, high = -Infinity, highDay = last.t;
  for (const point of points) {
    const hi = point.high != null ? point.high : point.close;
    const lo = point.low != null ? point.low : point.close;
    if (lo < low) low = lo;
    if (hi > high) { high = hi; highDay = point.t; }
  }
  return {
    source: 'COMEX ' + named.quoteCode,
    unit: 'USD per lb',
    range: '1y',
    contract: named.quoteCode,
    contractMonth: named.expirationMonth,
    symbol: named.yahoo,
    points: points,
    first: first,
    last: last,
    change: change,
    changePct: changePct,
    low: +low.toFixed(4),
    high: +high.toFixed(4),
    highDay: highDay
  };
}

function rangeFromRequest(req) {
  const rawUrl = (req && req.url) || '/';
  const q = rawUrl.indexOf('?');
  const params = new URLSearchParams(q >= 0 ? rawUrl.slice(q + 1) : '');
  const asked = (params.get('range') || '1y').toLowerCase();
  return RANGES[asked] || '1y';
}

async function resolveContract() {
  const targets = [QUOTES_URL, 'https://r.jina.ai/' + QUOTES_URL];
  let lastError = 'CME quote board did not respond';
  for (const url of targets) {
    try {
      const upstream = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json,text/plain,*/*' },
        signal: AbortSignal.timeout(url.indexOf('jina') >= 0 ? 8000 : 5000)
      });
      if (!upstream.ok) {
        lastError = 'CME HTTP ' + upstream.status;
        continue;
      }
      const quote = parseCmeQuotes(await upstream.text());
      if (!quote || !quote.yahoo) {
        lastError = 'CME contract missing';
        continue;
      }
      return quote;
    } catch (err) {
      lastError = err.message || 'CME fetch failed';
    }
  }
  throw new Error(lastError);
}

async function loadSeries(range) {
  let contract = DEFAULT_CONTRACT;
  try {
    const live = await resolveContract();
    contract = {
      quoteCode: live.quoteCode,
      expirationMonth: live.expirationMonth,
      yahoo: live.yahoo,
      delay: live.delay
    };
  } catch (err) {
    contract = DEFAULT_CONTRACT;
  }
  const symbol = encodeURIComponent(contract.yahoo);
  const urls = [
    'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=' + range,
    'https://query2.finance.yahoo.com/v8/finance/chart/' + symbol + '?interval=1d&range=' + range
  ];
  let lastError = 'no history source responded';
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000)
      });
      if (!upstream.ok) { lastError = 'chart HTTP ' + upstream.status; continue; }
      const points = pointsFromYahoo(await upstream.json());
      if (!points) { lastError = 'chart series empty'; continue; }
      const series = summarize(points, contract);
      series.range = range;
      return series;
    } catch (err) { lastError = err.message || 'chart fetch failed'; }
  }
  throw new Error(lastError);
}

async function handler(req, res) {
  try {
    const series = await loadSeries(rangeFromRequest(req));
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(series);
  } catch (err) {
    return res.status(502).json({ error: 'No copper history source responded.', detail: err.message });
  }
}

module.exports = handler;
module.exports.summarize = summarize;
module.exports.pointsFromYahoo = pointsFromYahoo;
module.exports.rangeFromRequest = rangeFromRequest;
module.exports.resolveContract = resolveContract;
