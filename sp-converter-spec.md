# Project Spec: USD/EUR ↔ Syrian Pound Converter (Web App)

## 1. Overview
A mobile-first, responsive, installable web app that converts between **USD**, **EUR**, and the **new Syrian Pound (S.P.)**, with the equivalent **Old S.P.** value always shown alongside. The entire UI is in **Arabic**, right-to-left (RTL). No backend — everything runs client-side with plain HTML/CSS/JS, persisting data via `localStorage`.

## 2. Core Conversion Logic
- Two independent, user-editable exchange rates:
  - `rateEUR`: how many new S.P. equal 1 EUR — default **155**
  - `rateUSD`: how many new S.P. equal 1 USD — default **137.50**
- Old S.P. is always: `oldSP = newSP × 100`
- Conversion directions supported (both ways, same screen):
  - USD ⇄ new S.P.
  - EUR ⇄ new S.P.
- The two rates are independent of each other (no cross-derivation between USD and EUR).

## 3. Screens / Layout

### 3.1 Main Converter Screen
- Two currency "cards", one for **USD** and one for **EUR** (or a toggle/tab to switch which foreign currency is active — implementer's choice, but both currencies must be reachable without extra navigation, e.g. tabs at top).
- For the active currency, show **two input fields** side by side or stacked:
  - Field A: amount in foreign currency (USD or EUR)
  - Field B: amount in new S.P.
  - Editing either field live-updates the other (two-way binding), using the current stored rate.
  - No "convert" button needed — calculate on input/keystroke.
- Directly below/next to the new S.P. result, **always show the Old S.P. equivalent** (read-only, clearly labeled, e.g. "الليرة القديمة"), calculated as `newSP × 100`. This updates live as well.
- Numbers should be formatted with thousands separators for readability; reasonable decimal precision (e.g. 2 decimals), avoid floating-point artifacts.

### 3.2 Rate Settings
- Accessible via a settings icon/button (gear icon) on the main screen — not a separate page, can be a modal/bottom sheet or collapsible section.
- Two editable numeric inputs: rate for EUR→S.P. and rate for USD→S.P., pre-filled with current stored values.
- A "Save" action persists the new rates to `localStorage` and immediately applies them to the converter.
- Show the currently active rates somewhere visible on the main screen too (small text, e.g. "1 يورو = 155 ل.س"), so the user always knows what rate is in effect without opening settings.
- Optionally show last-updated date/time for the rate (nice-to-have, not required).

## 4. Persistence
- Use `localStorage` (no backend, no login).
- Store: `rateEUR`, `rateUSD`, and optionally last-updated timestamp.
- On load, read stored rates if present; otherwise fall back to the defaults (155 / 137.50) and store them.

## 5. Language & Direction
- All UI text in **Arabic**.
- Page direction: `dir="rtl"`, `lang="ar"`.
- Use clear, simple Arabic labels, e.g.:
  - دولار أمريكي (USD)
  - يورو (EUR)
  - ليرة سورية جديدة (new S.P.)
  - ليرة سورية قديمة (Old S.P.)
  - سعر الصرف / تعديل سعر الصرف (exchange rate / edit rate)
  - حفظ (Save)
- Numerals: use standard Arabic (Western) digits (0–9) for input compatibility, unless implementer judges Eastern Arabic numerals fit better — Western digits preferred for reliable input parsing.

## 6. Visual Design
- Minimal, clean style.
- Color palette:
  - `#002A27` — primary background color (dark teal/green)
  - `#BCA673` — accent/secondary color (gold/tan), used for buttons, highlights, active states, borders
- Ensure sufficient contrast for text readability against the dark background (likely white or light `#BCA673`-tinted text on `#002A27`).
- Large, touch-friendly input fields and buttons (mobile-first — design for ~360–430px width first, then scale up).
- No heavy frameworks required; plain responsive CSS (flexbox/grid) is sufficient.

## 7. Installability ("Add to Home Screen")
- Implement as a basic PWA:
  - `manifest.json` with app name (Arabic), short_name, icons (at least 192×192 and 512×512), `start_url`, `display: standalone`, `theme_color: #002A27`, `background_color: #002A27`.
  - App icon reflecting the color palette.
  - Register a simple service worker for offline caching of the static assets (optional but recommended, since there's no network dependency anyway).
- Since iOS Safari does not show an automatic "install" prompt, include an on-screen instruction/banner (in Arabic) explaining how to add to home screen manually:
  - **iOS (Safari)**: tap the Share icon → "Add to Home Screen"
  - **Android (Chrome)**: tap the menu (⋮) → "Add to Home screen" / or use the native install prompt if `beforeinstallprompt` fires, showing a custom "Install" button.
- This banner/instructions can be dismissible and shown once (store a flag in `localStorage` so it doesn't nag repeatedly), or placed as a small permanent link/section (implementer's discretion), but it must be present somewhere in the app.

## 8. Technical Constraints
- Plain HTML/CSS/JavaScript (vanilla JS preferred, no build step required), single-page.
- No external data/API calls — everything is local and static.
- Fully responsive: must work well on small phone screens first, and remain usable on tablet/desktop.
- No user accounts, no server, no analytics required.

## 9. Out of Scope
- Real-time/live exchange rate fetching from the internet.
- Historical rate tracking/charts.
- Multi-language support beyond Arabic.
- Cross-derivation between USD and EUR rates.

## 10. Deliverable
A single deployable static site (HTML/CSS/JS + manifest + icons + optional service worker) implementing everything above, ready to host on any static hosting (e.g. GitHub Pages, Netlify, Vercel) so it can be installed on both Android and iOS home screens.
