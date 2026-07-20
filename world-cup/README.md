# World Cup and Leagues

Minimal mobile-first football dashboard with separate Cup and League selectors. Cup currently contains the World Cup; League contains the Premier League, La Liga, UAE Pro League, Saudi Pro League, and UEFA Champions League.

- Matches: dates, results, penalty winners, scorers, and highlight searches
- Groups: recorded standings using each edition's original points system
- Knockout: zoomable route to the final
- Scorers: edition-specific goal totals excluding own goals

League mode includes the latest five seasons, live match status and scores, and scorer totals derived from recorded scoring events. League schedules and standings come from ESPN's public soccer feeds. Competitions or seasons without a supported live feed display Coming soon.

Live API:

- `https://worldcup26.ir/get/games`
- `https://worldcup26.ir/get/groups`
- `https://worldcup26.ir/get/teams`
- `https://worldcup26.ir/get/stadiums`

The app auto-refreshes every 60 seconds while visible. A bundled API snapshot in `data/live-fallback.json` is used only if the live API request fails.

Historical editions are static and are generated from the Fjelstul World Cup Database. See `data/HISTORY-SOURCE.md` for attribution, licensing, and modification details.
