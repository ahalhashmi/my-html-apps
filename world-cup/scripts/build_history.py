import csv
import io
import json
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

SOURCE_ROOT = "https://datahub.io/football/worldcup/_r/-"
SOURCE_FILES = ("tournaments", "matches", "goals", "group_standings")
MEN_YEARS = (
    1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978,
    1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022,
)

FLAG_ALPHA2 = {
    "AGO": "ao", "ARE": "ae", "ARG": "ar", "AUS": "au", "AUT": "at", "BEL": "be",
    "BGR": "bg", "BIH": "ba", "BOL": "bo", "BRA": "br", "CAN": "ca", "CHE": "ch",
    "CHL": "cl", "CHN": "cn", "CIV": "ci", "CMR": "cm", "COD": "cd", "COL": "co",
    "CRI": "cr", "CSK": "cz", "CUB": "cu", "CZE": "cz", "DDR": "de", "DEU": "de",
    "DNK": "dk", "DZA": "dz", "ECU": "ec", "EGY": "eg", "ENG": "gb-eng", "ESP": "es",
    "FRA": "fr", "GHA": "gh", "GNQ": "gq", "GRC": "gr", "HND": "hn", "HRV": "hr",
    "HTI": "ht", "HUN": "hu", "IDN": "id", "IRL": "ie", "IRN": "ir", "IRQ": "iq",
    "ISL": "is", "ISR": "il", "ITA": "it", "JAM": "jm", "JPN": "jp", "KOR": "kr",
    "KWT": "kw", "MAR": "ma", "MEX": "mx", "NGA": "ng", "NIR": "gb-nir",
    "NLD": "nl", "NOR": "no", "NZL": "nz", "PAN": "pa", "PER": "pe", "POL": "pl",
    "PRK": "kp", "PRT": "pt", "PRY": "py", "QAT": "qa", "ROU": "ro", "RUS": "ru",
    "SAU": "sa", "SCG": "rs", "SCO": "gb-sct", "SEN": "sn", "SLV": "sv", "SRB": "rs",
    "SUN": "ru", "SVK": "sk", "SVN": "si", "SWE": "se", "TGO": "tg", "THA": "th",
    "TTO": "tt", "TUN": "tn", "TUR": "tr", "TWN": "tw", "UKR": "ua", "URY": "uy",
    "USA": "us", "WAL": "gb-wls", "YUG": "rs", "ZAF": "za",
}


def fetch_table(name):
    request = urllib.request.Request(f"{SOURCE_ROOT}/{name}.csv", headers={"User-Agent": "WorldCupArchiveBuilder/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        text = response.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text)))


def clean(value):
    text = str(value or "").strip()
    return "" if not text or text.lower() == "not applicable" else text


def integer(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def stage_type(stage_name, group_stage):
    if str(group_stage) == "1":
        return "group"
    stage = str(stage_name or "").lower()
    if "round of 16" in stage:
        return "r16"
    if "quarter" in stage:
        return "qf"
    if "semi" in stage:
        return "sf"
    if "third" in stage:
        return "third"
    if stage == "final":
        return "final"
    return "unknown"


def group_key(stage_name, group_name):
    return f"{stage_name or 'group stage'}|{group_name or ''}"


def player_name(goal):
    return " ".join(part for part in (clean(goal.get("given_name")), clean(goal.get("family_name"))) if part)


def goal_text(goal):
    name = player_name(goal) or "(missing data)"
    minute = clean(goal.get("minute_label")) or "(missing data)"
    note = " (OG)" if goal.get("own_goal") == "1" else " (p)" if goal.get("penalty") == "1" else ""
    return f"{name} {minute}{note}"


def team_record(team_id, name, code):
    alpha2 = FLAG_ALPHA2.get(code, "")
    return {
        "id": team_id,
        "name_en": name or "(missing data)",
        "fifa_code": code or "---",
        "iso2": alpha2.upper() if alpha2 and "-" not in alpha2 else "",
        "flag": f"https://flagcdn.com/w80/{alpha2}.png" if alpha2 else "",
    }


def match_winner_id(match):
    home_score = integer(match.get("home_team_score"))
    away_score = integer(match.get("away_team_score"))
    home_penalties = integer(match.get("home_team_score_penalties"))
    away_penalties = integer(match.get("away_team_score_penalties"))
    if home_score is not None and away_score is not None:
        if home_score > away_score:
            return match["home_team_id"]
        if away_score > home_score:
            return match["away_team_id"]
    if match.get("penalty_shootout") == "1" and home_penalties != away_penalties:
        return match["home_team_id"] if home_penalties > away_penalties else match["away_team_id"]
    if match.get("home_team_win") == "1":
        return match["home_team_id"]
    if match.get("away_team_win") == "1":
        return match["away_team_id"]
    return ""


tables = {name: fetch_table(name) for name in SOURCE_FILES}
editions = {}

for year in MEN_YEARS:
    tournament_id = f"WC-{year}"
    tournament = next((row for row in tables["tournaments"] if row["tournament_id"] == tournament_id), {})
    matches = [row for row in tables["matches"] if row["tournament_id"] == tournament_id]
    goals = [row for row in tables["goals"] if row["tournament_id"] == tournament_id]
    standings = [row for row in tables["group_standings"] if row["tournament_id"] == tournament_id]

    goals_by_match = defaultdict(list)
    for goal in goals:
        goals_by_match[goal["match_id"]].append(goal)

    team_map = {}
    for match in matches:
        team_map[match["home_team_id"]] = team_record(
            match["home_team_id"], clean(match["home_team_name"]), clean(match["home_team_code"])
        )
        team_map[match["away_team_id"]] = team_record(
            match["away_team_id"], clean(match["away_team_name"]), clean(match["away_team_code"])
        )

    games = []
    for match in matches:
        home_scorers = []
        away_scorers = []
        for goal in goals_by_match[match["match_id"]]:
            scoring_team_id = goal["player_team_id"] if goal["own_goal"] == "1" else goal["team_id"]
            if scoring_team_id == match["home_team_id"]:
                home_scorers.append(goal_text(goal))
            if scoring_team_id == match["away_team_id"]:
                away_scorers.append(goal_text(goal))

        stage = clean(match["stage_name"])
        group_name = clean(match["group_name"])
        games.append({
            "id": match["match_id"],
            "date_iso": clean(match["match_date"]),
            "match_time": clean(match["match_time"]),
            "date_missing": not clean(match["match_date"]),
            "time_missing": not clean(match["match_time"]),
            "home_team_id": match["home_team_id"],
            "away_team_id": match["away_team_id"],
            "home_team_name_en": clean(match["home_team_name"]) or "(missing data)",
            "away_team_name_en": clean(match["away_team_name"]) or "(missing data)",
            "home_score": clean(match["home_team_score"]),
            "away_score": clean(match["away_team_score"]),
            "score_missing": integer(match["home_team_score"]) is None or integer(match["away_team_score"]) is None,
            "home_penalty_score": clean(match["home_team_score_penalties"]) if match["penalty_shootout"] == "1" else None,
            "away_penalty_score": clean(match["away_team_score_penalties"]) if match["penalty_shootout"] == "1" else None,
            "home_scorers": home_scorers,
            "away_scorers": away_scorers,
            "finished": "TRUE",
            "time_elapsed": "finished",
            "type": stage_type(stage, match["group_stage"]),
            "stage_name": stage,
            "group": group_name.removeprefix("Group "),
            "group_key": group_key(stage, group_name),
            "knockout_stage": match["knockout_stage"] == "1",
            "replayed": match["replayed"] == "1",
            "replay": match["replay"] == "1",
            "winner_team_id": match_winner_id(match),
            "archive": True,
        })

    standings_by_group = defaultdict(list)
    for standing in standings:
        standings_by_group[group_key(standing["stage_name"], standing["group_name"])].append(standing)

    groups = []
    for key, rows in standings_by_group.items():
        rows.sort(key=lambda row: integer(row["position"]) or 999)
        groups.append({
            "key": key,
            "name": clean(rows[0]["group_name"]).removeprefix("Group "),
            "stage_name": clean(rows[0]["stage_name"]),
            "teams": [{
                "position": integer(row["position"]),
                "team_id": row["team_id"],
                "mp": integer(row["played"]),
                "w": integer(row["wins"]),
                "d": integer(row["draws"]),
                "l": integer(row["losses"]),
                "gf": integer(row["goals_for"]),
                "ga": integer(row["goals_against"]),
                "gd": integer(row["goal_difference"]),
                "pts": integer(row["points"]),
            } for row in rows],
        })

    scorer_map = {}
    for goal in (item for item in goals if item["own_goal"] != "1"):
        name = player_name(goal) or "(missing data)"
        key = clean(goal["player_id"]) or f"{goal['player_team_code']}|{name}"
        team = team_map.get(goal["player_team_id"]) or team_map.get(goal["team_id"], {})
        scorer = scorer_map.setdefault(key, {
            "name": name,
            "goals": 0,
            "team_id": team.get("id") or goal["player_team_id"] or goal["team_id"],
            "code": team.get("fifa_code") or goal["player_team_code"] or goal["team_code"] or "---",
            "flag": team.get("flag", ""),
        })
        scorer["goals"] += 1

    scorers = sorted(scorer_map.values(), key=lambda scorer: (-scorer["goals"], scorer["name"]))
    for index, scorer in enumerate(scorers, start=1):
        scorer["rank"] = index

    editions[str(year)] = {
        "year": year,
        "tournament_name": tournament.get("tournament_name", f"World Cup {year}"),
        "host": clean(tournament.get("host_country")) or "(missing data)",
        "winner": clean(tournament.get("winner")) or "(missing data)",
        "has_group_stage": any(tournament.get(field) == "1" for field in ("group_stage", "second_group_stage", "final_round")),
        "has_knockout_stage": any(game["knockout_stage"] and game["type"] != "third" for game in games),
        "games": games,
        "groups": groups,
        "teams": list(team_map.values()),
        "scorers": scorers,
    }

output = {
    "generated_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    "source": {
        "name": "Fjelstul World Cup Database",
        "author": "Joshua C. Fjelstul, Ph.D.",
        "url": "https://github.com/jfjelstul/worldcup",
        "license": "CC BY-SA 4.0",
        "license_url": "https://creativecommons.org/licenses/by-sa/4.0/",
    },
    "editions": editions,
}

output_path = Path(__file__).resolve().parent.parent / "data" / "history.json"
output_path.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"Wrote {output_path}")
men_goal_count = sum(1 for goal in tables["goals"] if goal["tournament_id"] in {f"WC-{year}" for year in MEN_YEARS})
print(f"Editions: {len(editions)}; matches: {sum(len(item['games']) for item in editions.values())}; goals: {men_goal_count}")
