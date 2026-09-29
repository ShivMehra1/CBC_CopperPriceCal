// Daily COMEX copper front-month (HG=F) bars for the chart.
// This route does not feed the quote. Pricing still uses the live COMEX field.

const RANGES = { '1mo': '1mo', '3mo': '3mo', '6mo': '6mo', '1y': '1y', '2y': '2y' };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const MIN = 0.5;
const MAX = 50;

function dayUTC(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function round4(n) {
  return +n.toFixed(4);
}

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

function summarize(points) {
  const first = points[0];
  const last = points[points.length - 1];
  const change = +(last.close - first.close).toFixed(4);
  const changePct = first.close ? +((change / first.close) * 100).toFixed(2) : 0;
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const hi = point.high != null ? point.high : point.close;
    const lo = point.low != null ? point.low : point.close;
    if (lo < low) low = lo;
    if (hi > high) high = hi;
  }
  return {
    source: 'COMEX HG=F',
    unit: 'USD per lb',
    range: '1y',
    points: points,
    first: first,
    last: last,
    change: change,
    changePct: changePct,
    low: +low.toFixed(4),
    high: +high.toFixed(4)
  };
}

function rangeFromRequest(req) {
  const rawUrl = (req && req.url) || '/';
  const q = rawUrl.indexOf('?');
  const params = new URLSearchParams(q >= 0 ? rawUrl.slice(q + 1) : '');
  const asked = (params.get('range') || '1y').toLowerCase();
  return RANGES[asked] || '1y';
}

async function loadSeries(range) {
  const urls = [
    'https://query1.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=' + range,
    'https://query2.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=' + range
  ];
  let lastError = 'no history source responded';
  for (const url of urls) {
    try {
      const upstream = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (!upstream.ok) {
        lastError = 'yahoo HTTP ' + upstream.status;
        continue;
      }
      const points = pointsFromYahoo(await upstream.json());
      if (!points) {
        lastError = 'yahoo series empty';
        continue;
      }
      const series = summarize(points);
      series.range = range;
      return series;
    } catch (err) {
      lastError = err.message || 'yahoo fetch failed';
    }
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
