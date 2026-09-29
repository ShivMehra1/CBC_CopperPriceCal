// Live COMEX copper price for the CBC pricing tool.
//
// Primary source is comexlive.org/copper/ (the page the pricing sheet references).
// Runs server-side on Vercel, so there is no CORS restriction and no third-party
// proxy in the path. A CME/COMEX futures feed is kept as a fallback so the tool
// keeps working if the page layout ever changes.

const PRIMARY = 'https://comexlive.org/copper/';
const FALLBACKS = [
  'https://query1.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=5d',
  'https://query2.finance.yahoo.com/v8/finance/chart/HG%3DF?interval=1d&range=5d'
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// Copper trades in single-digit USD per lb. Anything outside this band is a bad
// parse, not a price — reject it rather than quote from it.
const MIN = 0.5;
const MAX = 50;
const plausible = (n) => typeof n === 'number' && isFinite(n) && n > MIN && n < MAX;

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

// comexlive quotes copper to 4 decimals (e.g. 6.4675). Prefer a 4-decimal number
// that sits just after a "Last Trade" heading; fall back to the COPPER row of the
// commodities table.
function scrapePrice(html) {
  const text = toText(html);
  const attempts = [];

  // Collect every candidate near each label — not just the first — so a decoy
  // like the change column ("-0.0250") cannot shadow the real price.
  const collect = (segment) => {
    const four = segment.match(/\b\d{1,2}\.\d{4}\b/g) || [];
    const loose = segment.match(/\b\d{1,2}\.\d{2,4}\b/g) || [];
    for (const n of four.concat(loose)) attempts.push(parseFloat(n));
  };

  const labels = [/Last\s*Trade/gi, /\bCOPPER\b/g];
  for (const re of labels) {
    let m;
    while ((m = re.exec(text)) !== null) collect(text.slice(m.index, m.index + 300));
  }

  // Last resort: any plausible 4-decimal number on the page.
  collect(text);

  for (const value of attempts) {
    if (plausible(value)) return value;
  }
  return null;
}

async function fromComexLive() {
  const upstream = await fetch(PRIMARY, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!upstream.ok) throw new Error('comexlive HTTP ' + upstream.status);

  const price = scrapePrice(await upstream.text());
  if (!plausible(price)) throw new Error('comexlive price not found');

  return {
    price: price,
    updatedAt: new Date().toISOString(),
    unit: 'USD per lb',
    source: 'comexlive.org'
  };
}

async function fromFutures() {
  for (const url of FALLBACKS) {
    try {
      const upstream = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!upstream.ok) continue;

      const body = await upstream.json();
      const meta = body && body.chart && body.chart.result &&
        body.chart.result[0] && body.chart.result[0].meta;
      if (!meta) continue;

      const price = meta.regularMarketPrice != null ? meta.regularMarketPrice : meta.previousClose;
      if (!plausible(price)) continue;

      return {
        price: price,
        updatedAt: new Date((meta.regularMarketTime || Date.now() / 1000) * 1000).toISOString(),
        unit: 'USD per lb',
        source: 'comex-futures'
      };
    } catch (err) {
      // try the next fallback
    }
  }
  throw new Error('no futures source responded');
}

module.exports = async function handler(req, res) {
  try {
    const result = await fromComexLive();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (primaryErr) {
    try {
      const result = await fromFutures();
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
