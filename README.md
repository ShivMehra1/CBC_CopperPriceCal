# CBC Roofing Copper Pricing Tool

The quote math lives in the script at the bottom of `index.html`. The `RATES` block at the top of that script is where fabrication, freight, lead-coating, and the EU tariff are set. The chart under the quote does not change a quote until someone uses a day’s close.

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

`api/copper.js` reads CME Group’s public copper quote board (COMEX HG, 10 minutes delayed) and uses the contract with the most volume. If that board is blocked, it falls back to the same contract’s last trade. The page tries the board directly as well. Both the COMEX and FX fields stay editable, so a quote can still be finished by hand.

`api/history.js` names that same active contract, then loads a year of its daily open, high, low, and close. The page can filter that year to 1 month, 3 months, 6 months, or the full year. `?range=1y` is the default. `1mo`, `3mo`, `6mo`, and `2y` are also accepted. Session highs are part of each bar, so a day that traded near $6.90 shows even when the close settled lower. CME’s own settlement report for December 2026 on Sep 22, 2026 has a high of 6.9285. The continuous HG=F series does not.

Open these after a deploy:

    https://cbcroofingcopper.vercel.app/api/copper
    https://cbcroofingcopper.vercel.app/api/fx
    https://cbcroofingcopper.vercel.app/api/history

`/api/copper` should report `"source": "CME HGZ6"` (or whichever contract is most active) plus `contract` and `contractMonth`. `/api/history` should report that same contract and a `points` array whose `high` reaches the session spike.

Prices refresh on their own every 3 minutes. The live copper response is cached for 60 seconds, FX for 10 minutes, and the chart for 1 hour.
