# CBC Roofing Copper Pricing Tool — Vercel deployment

Everything needed is in this folder. No build step, no dependencies, no API keys.

## What is in here

    index.html        The complete tool (self-contained — fonts, logo, and code inlined)
    api/copper.js     Fetches the live COMEX copper front-month price (HG=F)
    api/fx.js         Fetches the live USD -> CAD exchange rate
    vercel.json       Vercel configuration

## How to deploy

### Option A — drag and drop (easiest)

1. Go to https://vercel.com/new
2. Drag this whole folder onto the page.
3. Click **Deploy**.

### Option B — Vercel CLI

    npm i -g vercel
    cd vercel-deploy
    vercel --prod

## Where the price comes from

`api/copper.js` reads the live copper price from **comexlive.org/copper/** —
the same page the pricing sheet references. It runs on Vercel's servers rather
than in the browser, which is what makes this possible: browsers block direct
requests to market-data sites (CORS), servers do not.

If that page is ever unreachable or changes layout, it automatically falls back
to a CME/COMEX futures feed. The parser also rejects any figure outside a
plausible range for copper, so a bad read produces no price rather than a wrong
quote.

The page calls `/api/copper` and `/api/fx` first. If either is ever
unavailable it silently falls back to public sources, and both fields always
stay editable by hand — so the tool never blocks a quote.

Prices are cached for 60 seconds (FX for 10 minutes) so heavy use does not hit
rate limits. The page refreshes on its own every 3 minutes.

## Verifying it works after deploy

Open these on your deployed domain — each should return JSON:

    https://YOUR-DOMAIN.vercel.app/api/copper
    https://YOUR-DOMAIN.vercel.app/api/fx

`/api/copper` should report `"source": "comexlive.org"` and a price matching
the Last Trade figure shown on https://comexlive.org/copper/. If it instead
reports `"source": "comex-futures"`, the primary page could not be read and the
fallback is in use.

## Notes

- The COMEX and FX fields remain manually editable; typing in one overrides the
  live value for that session.
- The header's two links open in new tabs, so an in-progress quote is never
  lost: **Metal Pricing** → https://pricings-cbc.vercel.app and
  **Outside Sales** → https://outsidesalescbc.vercel.app.
- Fabrication rates, lead-coating costs, and the EU tariff are constants inside
  `index.html`. When those change, they need updating in the source, not here.
- To re-generate `index.html` after design changes, re-bundle the source
  design rather than editing this compiled file by hand.
