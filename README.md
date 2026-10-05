# Thread Mav — PWA Test 1.0

Built by a Machinist, for Machinists. Offline-first, private shop-floor calculators (threads/3-wire, sine bar). Vanilla TypeScript + Vite; no server, no account, no analytics.

## Commands
```
npm install
npm run dev        # dev server (service worker disabled)
npm test           # unit tests (vitest)
npm run build      # typecheck + production build into dist/ (generates dist/sw.js)
npm run preview    # serve dist/ locally
```

## Deploy (static, any host)
Upload `dist/` to any HTTPS static host (paths are relative, so subfolders work). HTTPS is required for install/offline.
GitHub Pages: repo Settings → Pages → Source: **GitHub Actions**; `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

## Install on iPhone
1. Open the deployed HTTPS URL in **Safari**. 2. Share → **Add to Home Screen** → Add. 3. Launch from the Home Screen icon (opens full-screen). 4. Open once online, wait a few seconds, then it works in airplane mode.
Updates: a "Update ready — RELOAD" bar appears when a new build is deployed (or Settings → Check for update).

## Layout
- `src/calculators/<name>/` — `engine.ts` (pure math), `present.ts` (formatting), `ui.ts`; register in `calculators/registry.ts`
- `src/calculators/thread/standards/` — fail-closed standards gate; `records.ts` is intentionally empty
- `src/core/` units, numeric parsing, results model · `src/storage/` IndexedDB + migrations · `tests/`

## Status
Implemented: thread/3-wire (Unified, ISO metric, custom, actual wire, manual limits, measured-reading check), sine bar, saved/history/recents/favorites/notes, settings, share/JSON export, offline PWA.
Not implemented (listed as PLANNED in-app): all other roadmap calculators, PDF export, internal-thread wire measurement, verified ASME/ISO tolerance data.
Note: the spec's sine example "32.868 mm" is slightly off; 5" × sin15° = 1.294095" = **32.870 mm** (tests assert the exact value).
