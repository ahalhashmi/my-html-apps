# World Cup Archive

Minimal mobile-first World Cup dashboard covering 2026 and every completed men's edition from 1930 through 2022:

- Matches: dates, results, penalty winners, scorers, and highlight searches
- Groups: recorded standings using each edition's original points system
- Knockout: zoomable route to the final
- Scorers: edition-specific goal totals excluding own goals

Live API:

- `https://worldcup26.ir/get/games`
- `https://worldcup26.ir/get/groups`
- `https://worldcup26.ir/get/teams`
- `https://worldcup26.ir/get/stadiums`

The app auto-refreshes every 60 seconds while visible. A bundled API snapshot in `data/live-fallback.json` is used only if the live API request fails.

Historical editions are static and are generated from the Fjelstul World Cup Database. See `data/HISTORY-SOURCE.md` for attribution, licensing, and modification details.
