# محوّل الليرة السورية — USD/EUR ↔ S.P. Converter

Static, installable (PWA) Arabic RTL converter between USD, EUR and the new Syrian Pound, always showing the Old S.P. value (`new × 100`). Implements [sp-converter-spec.md](sp-converter-spec.md).

## Files
- `index.html` — markup (tabs, converter card, rate sheet, install instructions)
- `styles.css` — mobile-first styling (Forest / Golden Wheat / Deep Umber / Charcoal palette as CSS tokens)
- `app.js` — conversion, live formatting, `localStorage` persistence, install banner
- `manifest.json`, `sw.js`, `icons/` — PWA manifest, offline cache, app icons (`icons/logo.svg` is the favicon)
- `fonts/` — HayyakumAllah (Light 300, Regular 400, Medium 500, Bold 700)

## Run locally
Any static server works. The service worker needs `http://localhost` or HTTPS (not `file://`).

```bash
npx serve .
```

## Deploy
Upload the folder as-is to GitHub Pages, Netlify or Vercel. All paths are relative, so sub-path hosting (e.g. `user.github.io/sp-converter/`) works.

## Notes
- `localStorage` keys: `rateUSD`, `rateEUR`, `ratesUpdatedAt`, `activeCurrency`, `installHintDismissed`.
- Input accepts Western and Eastern Arabic digits; a typed comma is treated as the decimal point.
- The service worker is stale-while-revalidate: changes show up on the second load after deploy. Bump `CACHE_VERSION` in `sw.js` only when the asset list changes.
- PNG app icons are the logo centered at 64% width on `#002623` (fits the Android maskable safe zone). Render SVG with a real browser (e.g. headless Chrome); `sips` ignores the logo's clip paths.
