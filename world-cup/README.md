# Cups, Leagues, and UFC

Minimal mobile-first sports dashboard with separate Cup, League, and UFC selectors. Cup currently contains the World Cup; League contains the Premier League, La Liga, UAE Pro League, Saudi Pro League, and UEFA Champions League. UFC includes all major UFC cards, numbered events, and Fight Nights.

- Matches: dates, results, penalty winners, scorers, and highlight searches
- Groups: recorded standings using each edition's original points system
- Knockout: zoomable route to the final
- Scorers: edition-specific goal totals excluding own goals

League mode includes the latest five seasons, live match status and scores, and scorer totals derived from recorded scoring events. The Premier League, La Liga, Saudi Pro League, and UEFA Champions League use ESPN's public soccer feeds. UAE Pro League fixtures, standings, scorers, and match events come from the official UAE Pro League website through the scheduled fallback workflow. Competitions or seasons without published data display Coming soon.

UFC mode includes the latest five calendar years with local event times, expandable fight cards, live/final bout status, records, flags, and W/L results. Event schedules and results use ESPN's public UFC feed. Current division rankings and champions are loaded from the official UFC rankings page. Current-year event results refresh every 60 seconds while the app is visible.

Live API:

- `https://worldcup26.ir/get/games`
- `https://worldcup26.ir/get/groups`
- `https://worldcup26.ir/get/teams`
- `https://worldcup26.ir/get/stadiums`

The app checks for updates every 60 seconds while visible. A bundled API snapshot in `data/live-fallback.json` is used only if the live API request fails.

UAE Pro League data is refreshed every five minutes from `https://www.uaepl.ae/en/fixtures` by `.github/workflows/update-world-cup-fallback.yml`. The official site does not permit browser-side cross-origin requests, so the workflow stores a public static snapshot without requiring or exposing an API key. While matches are in progress, the app also checks the league's public realtime match feed every 60 seconds for scores and match minutes.

Historical editions are static and are generated from the Fjelstul World Cup Database. See `data/HISTORY-SOURCE.md` for attribution, licensing, and modification details.
