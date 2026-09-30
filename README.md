# محوّل الليرة السورية — USD/EUR ↔ S.P. Converter

Static, installable (PWA) Arabic RTL converter between USD, EUR and the new Syrian Pound, always showing the Old S.P. value (`new × 100`). Implements [sp-converter-spec.md](sp-converter-spec.md).

## Files
- `index.html` — markup (tabs, converter card, rate sheet, install instructions)
- `styles.css` — mobile-first styling (Forest / Golden Wheat / Deep Umber / Charcoal palette as CSS tokens)
- `app.js` — conversion, live formatting, `localStorage` persistence, install banner
- `manifest.json`, `sw.js`, `icons/` — PWA manifest, offline cache, app icons (`icons/logo.svg` is the favicon)
- `assets/notes/` — banknote images used by the app (360 px JPEG, ~25 KB each), made from the originals in `assets/*.png`
- `fonts/` — HayyakumAllah (Light 300, Regular 400, Medium 500, Bold 700)

## Run locally
Any static server works. The service worker needs `http://localhost` or HTTPS (not `file://`).

```bash
npx serve .
```

## Deploy
Upload the folder as-is to GitHub Pages, Netlify or Vercel. All paths are relative, so sub-path hosting (e.g. `user.github.io/sp-converter/`) works.

## Notes
- Rate sync: the settings sheet's sync button GETs `RATES_API_URL` (in `app.js`) and fills the inputs from `data.rates[code].cities.damascus.buy` for USD/EUR, divided by 100 (API is in old S.P.). Nothing is stored until the user taps حفظ. This is the app's only network call; everything else works offline.
- Banknotes: tap a note to count it (+1), «−» to take one back; untouched notes are gray. The feedback compares the counted total with the new S.P. amount (matched / missing / extra). «اقتراح» fills the fewest-notes breakdown via `breakdown()` (bulk of the largest note + exact DP on the rest, so 30 = 10×3); «تصفير» resets. Counts are not saved between visits.
- `localStorage` keys: `rateUSD`, `rateEUR`, `ratesUpdatedAt`, `activeCurrency`, `installHintDismissed`.
- Input accepts Western and Eastern Arabic digits; a typed comma is treated as the decimal point.
- The service worker is stale-while-revalidate: changes show up on the second load after deploy. Bump `CACHE_VERSION` in `sw.js` only when the asset list changes.
- PNG app icons: logo (50% width) plus "Converter" in HayyakumAllah Bold `#b9a779` on `#002623`, kept inside the Android maskable safe zone. Render the 512 px icon with a real browser (headless Chrome; `sips` ignores the logo's clip paths, and headless Chrome can't render windows below ~500 px), then `sips -z` it down to 192 and 180.
