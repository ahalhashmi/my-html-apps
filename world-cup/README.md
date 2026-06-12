# World Cup Live UAE

Minimal mobile-first World Cup dashboard with three tabs:

- Matches: UAE kickoff time for upcoming matches, live/finished score when available
- Groups: API-provided group standings
- Knockout: knockout-round matches grouped by round

Live API:

- `https://worldcup26.ir/get/games`
- `https://worldcup26.ir/get/groups`
- `https://worldcup26.ir/get/teams`
- `https://worldcup26.ir/get/stadiums`

The app auto-refreshes every 60 seconds while visible. A bundled API snapshot in `data/live-fallback.json` is used only if the live API request fails.
