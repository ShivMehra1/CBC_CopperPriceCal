// Daily COMEX copper front-month (HG=F) closes for the chart.
// This route does not feed the quote. Pricing still uses the live COMEX field.

const URLS = [
  'https://query1.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=3mo',
  'https://query2.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=3mo'
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const MIN = 0.5;
const MAX = 50;

function dayUTC(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function pointsFromYahoo(body) {
  const result = body && body.chart && body.chart.result && body.chart.result[0];
  if (!result) return null;
  const times = result.timestamp || [];
  const quote = result.indicators && result.indicators.quote && result.indicators.quote[0];
  const closes = quote && quote.close || [];
  const points = [];
  for (let i = 0; i < times.length; i++) {
    const close = closes[i];
    if (typeof close !== 'number' || !isFinite(close) || close <= MIN || close >= MAX) continue;
    points.push({ t: dayUTC(times[i]), close: +close.toFixed(4) });
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
    if (point.close < low) low = point.close;
    if (point.close > high) high = point.close;
  }
  return {
    source: 'COMEX HG=F',
    unit: 'USD per lb',
    points: points,
    first: first,
    last: last,
    change: change,
    changePct: changePct,
    low: +low.toFixed(4),
    high: +high.toFixed(4)
  };
}

async function loadSeries() {
  let lastError = 'no history source responded';
  for (const url of URLS) {
    try {
      const upstream = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!upstream.ok) {
        lastError = 'yahoo HTTP ' + upstream.status;
        continue;
      }
      const points = pointsFromYahoo(await upstream.json());
      if (!points) {
        lastError = 'yahoo series empty';
        continue;
      }
      return summarize(points);
    } catch (err) {
      lastError = err.message || 'yahoo fetch failed';
    }
  }
  const error = new Error(lastError);
  throw error;
}

async function handler(req, res) {
  try {
    const series = await loadSeries();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(series);
  } catch (err) {
    return res.status(502).json({ error: 'No copper history source responded.', detail: err.message });
  }
}

module.exports = handler;
module.exports.summarize = summarize;
module.exports.pointsFromYahoo = pointsFromYahoo;
