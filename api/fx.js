// Serverless USD -> CAD rate lookup.
const SOURCES = [
  { url: 'https://open.er-api.com/v6/latest/USD', pick: (j) => j && j.rates && j.rates.CAD },
  { url: 'https://api.frankfurter.app/latest?from=USD&to=CAD', pick: (j) => j && j.rates && j.rates.CAD }
];

module.exports = async function handler(req, res) {
  for (const source of SOURCES) {
    try {
      const upstream = await fetch(source.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CBCPricingTool/1.0)' }
      });
      if (!upstream.ok) continue;

      const rate = source.pick(await upstream.json());
      if (!(rate > 0)) continue;

      res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
      return res.status(200).json({ rate: rate, pair: 'USD/CAD', updatedAt: new Date().toISOString() });
    } catch (err) {
      // try the next source
    }
  }
  return res.status(502).json({ error: 'No upstream FX source responded.' });
};
