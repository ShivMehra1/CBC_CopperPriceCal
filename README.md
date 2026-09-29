# CBC Roofing Copper Pricing Tool

The quote math lives in the script at the bottom of `index.html`. The `RATES` block at the top of that script is where fabrication, freight, lead-coating, and the EU tariff are set. The 3-month chart does not change a quote.

## Layout

    index.html                         The page, including the quote script
    assets/logo.png                    CBC logo
    assets/fonts/                      DM Sans and Doppio One
    vendor/dc-runtime.js               Page runtime
    vendor/react.production.min.js     React 18.3.1
    vendor/react-dom.production.min.js React DOM 18.3.1
    api/copper.js                      Live COMEX copper price
    api/fx.js                          Live USD to CAD rate
    api/history.js                     Daily COMEX bars for the past year
    vercel.json                        Vercel configuration
    package.json                       Pins the Vercel runtime to Node 24

Pushes to `main` on https://github.com/ShivMehra1/CBC_CopperPriceCal deploy this project. Production is https://cbcroofingcopper.vercel.app.

## Market data

`api/copper.js` reads the live copper price from comexlive.org/copper/, then falls back to the COMEX front-month futures quote (HG=F). The page also tries those public feeds directly. Both the COMEX and FX fields stay editable, so a quote can still be finished by hand.

`api/history.js` loads a year of daily HG=F bars for the chart under the quote. The page can filter that year to 1 month, 3 months, 6 months, or the full year, and read open, high, low, and close for any session. `?range=1y` is the default. `1mo`, `3mo`, `6mo`, and `2y` are also accepted.

Open these after a deploy:

    https://cbcroofingcopper.vercel.app/api/copper
    https://cbcroofingcopper.vercel.app/api/fx
    https://cbcroofingcopper.vercel.app/api/history

`/api/copper` should report `"source": "comexlive.org"` when that page can be read, or `"source": "comex-futures"` when the fallback is in use. `/api/history` should report `"source": "COMEX HG=F"` and a `points` array.

Prices refresh on their own every 3 minutes. The live copper response is cached for 60 seconds, FX for 10 minutes, and the chart for 1 hour.
