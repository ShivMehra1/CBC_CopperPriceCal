// CME Group public copper quotes (COMEX HG, product 438).
// The website publishes a 10-minute delayed quote board. A full year of
// settlements is not on that board — only the live contracts — so the chart
// uses the same contract's daily bars once this file names it.

const QUOTES_URL = 'https://www.cmegroup.com/CmeWS/mvc/quotes/v2/438?pageSize=50';
const MIN = 0.5;
const MAX = 50;

function plausible(n) {
  return typeof n === 'number' && isFinite(n) && n > MIN && n < MAX;
}

function num(value) {
  if (typeof value === 'number') return value;
  const matched = String(value == null ? '' : value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return matched ? parseFloat(matched[0]) : NaN;
}

function volumeOf(quote) {
  const v = num(quote && quote.volume);
  return isFinite(v) && v > 0 ? v : 0;
}

function interestOf(quote) {
  const v = num(quote && quote.openInterest);
  return isFinite(v) && v > 0 ? v : 0;
}

// HGZ6 in 2026 → HGZ26.CMX. The digit on a CME quote code is the year within the decade.
function yahooFromQuote(code, nowYear) {
  const matched = String(code || '').match(/^([A-Z]{2,3})([FGHJKMNQUVXZ])(\d)$/);
  if (!matched) return null;
  const year = nowYear == null ? new Date().getFullYear() : nowYear;
  const decade = Math.floor(year / 10) * 10;
  let full = decade + Number(matched[3]);
  if (full < year - 1) full += 10;
  return matched[1] + matched[2] + String(full).slice(-2) + '.CMX';
}

function parseCmeQuotes(text, nowYear) {
  const raw = String(text || '');
  const start = raw.indexOf('{"quoteDelayed"');
  const brace = start >= 0 ? start : raw.indexOf('{');
  if (brace < 0) return null;
  let body = null;
  const slice = raw.slice(brace);
  try {
    body = JSON.parse(slice);
  } catch (err) {
    const end = slice.lastIndexOf('}');
    if (end >= 0) {
      try { body = JSON.parse(slice.slice(0, end + 1)); } catch (err2) { body = null; }
    }
  }
  if (!body) return null;
  const quotes = body && Array.isArray(body.quotes) ? body.quotes : [];
  let bestVol = null;
  let bestOi = null;
  for (const quote of quotes) {
    if (quote && quote.productCode && quote.productCode !== 'HG') continue;
    const last = num(quote.last);
    const prior = num(quote.priorSettle);
    const price = plausible(last) ? last : prior;
    if (!plausible(price)) continue;
    const vol = volumeOf(quote);
    const oi = interestOf(quote);
    if (!bestVol || vol > bestVol.vol) bestVol = { quote, vol, price };
    if (!bestOi || oi > bestOi.oi) bestOi = { quote, oi, price };
  }
  // Before the session has traded, every volume is 0 and the first listed
  // month is the illiquid spot. Open interest names the active contract.
  const best = bestVol && bestVol.vol > 0 ? bestVol : bestOi;
  if (!best) return null;
  const quote = best.quote;
  const price = best.price;
  const quoteCode = quote.quoteCode || '';
  return {
    price: +price.toFixed(4),
    quoteCode: quoteCode,
    expirationMonth: quote.expirationMonth || '',
    yahoo: yahooFromQuote(quoteCode, nowYear),
    delay: body.quoteDelay || (body.quoteDelayed ? '10 minutes' : ''),
    tradeDate: body.tradeDate || '',
    updated: quote.updated || '',
    open: plausible(num(quote.open)) ? +num(quote.open).toFixed(4) : null,
    high: plausible(num(quote.high)) ? +num(quote.high).toFixed(4) : null,
    low: plausible(num(quote.low)) ? +num(quote.low).toFixed(4) : null,
    priorSettle: plausible(num(quote.priorSettle)) ? +num(quote.priorSettle).toFixed(4) : null,
    volume: best.vol || 0
  };
}

module.exports = {
  QUOTES_URL,
  plausible,
  yahooFromQuote,
  parseCmeQuotes
};
