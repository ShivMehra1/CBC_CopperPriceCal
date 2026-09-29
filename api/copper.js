// Live COMEX copper for the CBC pricing tool.
//
// Primary source is CME Group's public copper quote board (product HG, 438),
// 10 minutes delayed. The price is the contract with the most volume that day,
// which is the active copper future the sheet is meant to follow.
// If CME blocks the server, the same contract's last trade is read from its
// COMEX daily chart. The quote field stays editable either way.

const { QUOTES_URL, parseCmeQuotes, plausible } = require('./cme');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';
const JINA = 'https://r.jina.ai/' + QUOTES_URL;

async function fetchText(url, ms) {
  const upstream = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json,text/plain,*/*' },
    signal: AbortSignal.timeout(ms)
  });
  if (!upstream.ok) throw new Error('HTTP ' + upstream.status);
  return upstream.text();
}

function pack(quote, source) {
  return {
    price: quote.price,
    updatedAt: quote.updated || new Date().toISOString(),
    unit: 'USD per lb',
    source: source,
    contract: quote.quoteCode,
    contractMonth: quote.expirationMonth,
    delay: quote.delay || ''
  };
}

async function fromCme() {
  let lastError = 'CME quote board did not respond';
  for (const target of [
    { url: QUOTES_URL, ms: 5000 },
    { url: JINA, ms: 8000 }
  ]) {
    try {
      const quote = parseCmeQuotes(await fetchText(target.url, target.ms));
      if (!quote) {
        lastError = 'CME copper quote was empty';
        continue;
      }
      return pack(quote, 'CME ' + quote.quoteCode);
    } catch (err) {
      lastError = err.name === 'TimeoutError' ? 'CME timed out' : (err.message || 'CME fetch failed');
    }
  }
  throw new Error(lastError);
}

async function fromContractChart(symbol) {
  const urls = [
    'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=5d',
    'https://query2.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=1d&range=5d'
  ];
  let lastError = 'contract chart did not respond';
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!upstream.ok) {
        lastError = 'chart HTTP ' + upstream.status;
        continue;
      }
      const body = await upstream.json();
      const meta = body && body.chart && body.chart.result &&
        body.chart.result[0] && body.chart.result[0].meta;
      const price = meta && (meta.regularMarketPrice != null ? meta.regularMarketPrice : meta.previousClose);
      if (!plausible(price)) {
        lastError = 'chart price empty';
        continue;
      }
      return {
        price: +Number(price).toFixed(4),
        updatedAt: new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
        unit: 'USD per lb',
        source: 'COMEX ' + (meta.symbol || symbol),
        contract: meta.symbol || symbol,
        contractMonth: meta.shortName || '',
        delay: ''
      };
    } catch (err) {
      lastError = err.message || 'chart fetch failed';
    }
  }
  throw new Error(lastError);
}

module.exports = async function handler(req, res) {
  try {
    const result = await fromCme();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (primaryErr) {
    try {
      const result = await fromContractChart('HGZ26.CMX');
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(result);
    } catch (fallbackErr) {
      return res.status(502).json({
        error: 'No copper price source responded.',
        detail: primaryErr.message
      });
    }
  }
};

module.exports.fromCme = fromCme;
module.exports.parseCmeQuotes = parseCmeQuotes;
