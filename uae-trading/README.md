# UAE Trading Scanner

Static GitHub Pages dashboard for UAE market trend and trade-decision research.

- Reads the published snapshot from `data/latest.json`
- Stores portfolio positions locally in the browser
- Shows decision, buy zone, stop, targets, risk/reward, and position P/L
- Refreshes published data through GitHub Actions at 08:05 Asia/Dubai

The GitHub Pages version cannot run a live Python server or place trades. It is a portable read-only dashboard over the latest committed market snapshot. The local Python app remains the place for on-demand full scans and future broker or AI integrations.
