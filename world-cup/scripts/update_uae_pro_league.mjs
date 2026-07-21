import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const BASE_URL = "https://www.uaepl.ae";
const OUTPUT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/uae-pro-league.json"
);
const SEASONS = {
  2026: "b8785e20-745f-11f1-82d0-f556dfffd44c",
  2025: "5c8e6ba0-5728-11f0-9b1f-e3f62e1405e2",
  2024: "4191a490-3c62-11ef-9586-1d1cfcc58710",
  2023: "b657ff00-0f33-11ee-9af7-a3b983d62145",
  2022: "226f5de0-0273-11ed-962c-fd1e30575aef"
};
const TEAM_CODES = {
  "ajman": "AJM",
  "al-ain": "AIN",
  "al-bataeh": "BAT",
  "al-dhafra": "DHA",
  "al-jazira": "JAZ",
  "al-nasr": "NAS",
  "al-wahda": "WAH",
  "al-wasl": "WAS",
  "bani-yas": "BAN",
  "dibba": "DIB",
  "emirates": "EMI",
  "hatta": "HAT",
  "kalba": "KAL",
  "khorfakkan": "KHO",
  "shabab-alahli": "SAH",
  "sharjah": "SHJ",
  "united-fc": "UFC"
};

function args() {
  const values = process.argv.slice(2);
  const seasonIndex = values.indexOf("--season");
  return {
    seasons: values.includes("--all")
      ? Object.keys(SEASONS).map(Number)
      : [seasonIndex >= 0 ? Number(values[seasonIndex + 1]) : 2026],
    details: values.includes("--details")
  };
}

async function fetchText(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ahalhashmi/my-html-apps football dashboard",
          "X-Requested-With": "XMLHttpRequest"
        },
        signal: AbortSignal.timeout(60000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
      return response.text();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

async function fetchHtmlEnvelope(pathname, params) {
  const url = new URL(pathname, BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = JSON.parse(await fetchText(url));
  return payload.html || "";
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function teamSlug(link, name) {
  const match = String(link || "").match(/\/clubs\/([^/?#]+)/i);
  return match?.[1] || compactText(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fallbackCode(slug, name) {
  if (TEAM_CODES[slug]) return TEAM_CODES[slug];
  const words = compactText(name).replace(/^al\s+/i, "").split(/\s+/).filter(Boolean);
  return words.length === 1
    ? words[0].replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase()
    : words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function localDateToUtc(dateText, timeText) {
  if (!dateText || !/^\d{1,2}:\d{2}$/.test(timeText)) return "";
  const parsed = new Date(`${dateText} ${timeText} GMT+0400`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function parseScore(value) {
  const match = compactText(value).match(/(\d+)\s*[:\-]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : [null, null];
}

function parseFixtures(html) {
  const $ = cheerio.load(html);
  const games = [];
  const teams = new Map();

  $(".upcomingMatches__box").each((_, element) => {
    const box = $(element);
    const nameNodes = box.find(".upcomingMatches__club-name");
    const logoNodes = box.find(".upcomingMatches__club-logo img");
    const linkNodes = box.find(".upcomingMatches__club-logo a");
    if (nameNodes.length < 2) return;

    const sides = [0, 1].map((index) => {
      const name = compactText($(nameNodes[index]).text());
      const slug = teamSlug($(linkNodes[index]).attr("href"), name);
      const team = {
        id: slug,
        name_en: name,
        fifa_code: fallbackCode(slug, name),
        flag: $(logoNodes[index]).attr("src") || "",
        is_club: true
      };
      teams.set(slug, { ...teams.get(slug), ...team });
      return team;
    });

    const dateNodes = box.find(".upcomingMatches__time-info-date");
    const dateText = compactText($(dateNodes[dateNodes.length - 1]).text());
    const timeText = compactText(box.find(".upcomingMatches__time-info-num").first().text());
    const dateUtc = localDateToUtc(dateText, timeText);
    if (!dateUtc) return;

    const statusText = compactText(box.find(".upcomingMatches__time-top").first().text());
    const [homeScore, awayScore] = parseScore(box.find(".upcomingMatches__score").first().text());
    const finished = /^(?:FT|AET|Played)$/i.test(statusText) || (homeScore !== null && !statusText);
    const live = !finished && /live|half|\d+/i.test(statusText);
    const detailLink = box.find('a[href*="/fixtures/"]').last().attr("href") || "";
    const detailId = detailLink.match(/\/fixtures\/([^/?#]+)/i)?.[1] || "";
    const optaId = String(box.attr("id") || "").replace(/^matchList_/, "");
    const week = compactText($(dateNodes[0]).text()).match(/\d+/)?.[0] || "";

    games.push({
      id: detailId || optaId || `${sides[0].id}-${sides[1].id}-${dateUtc}`,
      official_detail_url: detailLink,
      opta_id: optaId,
      date_utc: dateUtc,
      home_team_id: sides[0].id,
      away_team_id: sides[1].id,
      home_team_name_en: sides[0].name_en,
      away_team_name_en: sides[1].name_en,
      home_score: homeScore === null ? "0" : String(homeScore),
      away_score: awayScore === null ? "0" : String(awayScore),
      home_scorers: [],
      away_scorers: [],
      highlights_url: box.find(".btn--match-report").attr("href") || "",
      finished: finished ? "TRUE" : "FALSE",
      time_elapsed: finished ? "finished" : live ? statusText : "notstarted",
      type: "group",
      group: "",
      group_key: "uae-pro-league",
      gameweek: week,
      score_missing: homeScore === null || awayScore === null
    });
  });

  return { games, teams };
}

function parseStandings(html, teams) {
  const $ = cheerio.load(html);
  const rows = [];
  $(".section-standing__item.accordion-title-pl").each((_, element) => {
    const cells = $(element).children(".section-standing__cell");
    if (cells.length < 10) return;
    const nameCell = $(cells[1]);
    const name = compactText(nameCell.find("span").first().text());
    const link = nameCell.find("a").attr("href") || "";
    const slug = teamSlug(link, name);
    const numberAt = (index) => Number(compactText($(cells[index]).text()).replace(/[^\d-]/g, "")) || 0;
    teams.set(slug, {
      ...teams.get(slug),
      id: slug,
      name_en: name,
      fifa_code: fallbackCode(slug, name),
      flag: nameCell.find("img").attr("src") || teams.get(slug)?.flag || "",
      is_club: true
    });
    rows.push({
      team_id: slug,
      position: numberAt(0),
      mp: numberAt(2),
      w: numberAt(3),
      d: numberAt(4),
      l: numberAt(5),
      ga: numberAt(6),
      gf: numberAt(7),
      gd: Number(compactText($(cells[8]).text()).replace(/[^\d+-]/g, "")) || 0,
      pts: numberAt(9),
      total: 26
    });
  });
  return rows;
}

function parseScorers(html) {
  const $ = cheerio.load(html);
  const scorers = [];
  $(".dataCellWrap").each((_, element) => {
    const row = $(element);
    const rank = Number(compactText(row.find(".cell.goals").first().text()));
    const name = compactText(row.find(".cell.name span").last().text());
    const goals = Number(compactText(row.find(".cell.stats").last().text()));
    if (!rank || !name || !Number.isFinite(goals) || goals <= 0) return;
    scorers.push({
      rank,
      name,
      goals,
      flag: row.find(".cell.club img").attr("src") || ""
    });
  });
  return scorers;
}

function extractAssignedJson(html, variableName) {
  const marker = new RegExp(`(?:var|let|const)\\s+${variableName}\\s*=\\s*`);
  const match = marker.exec(html);
  if (!match) return null;
  const start = html.indexOf("{", match.index + match[0].length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(html.slice(start, index + 1));
  }
  return null;
}

function goalMinute(goal) {
  const minute = Number(goal.timeMin) || 0;
  const period = Number(goal.periodId) || 0;
  if (period === 1 && minute > 45) return `45+${minute - 45}'`;
  if (period === 2 && minute > 90) return `90+${minute - 90}'`;
  if (period === 3 && minute > 105) return `105+${minute - 105}'`;
  if (period === 4 && minute > 120) return `120+${minute - 120}'`;
  return `${minute}'`;
}

async function addMatchDetails(game) {
  if (!game.official_detail_url || game.finished !== "TRUE" || game.score_missing) return game;
  const listedGoals = Number(game.home_score) + Number(game.away_score);
  const savedGoals = (game.home_scorers?.length || 0) + (game.away_scorers?.length || 0);
  if (savedGoals === listedGoals) return game;
  const html = await fetchText(game.official_detail_url);
  const matchEvent = extractAssignedJson(html, "matchEvent");
  const payload = matchEvent?.events || {};
  const goals = payload.liveData?.goal || [];
  const contestants = payload.matchInfo?.contestant || [];
  const contestantSide = new Map(contestants.map((team) => [String(team.id), team.position]));
  let homeScore = 0;
  let awayScore = 0;
  const home = [];
  const away = [];

  [...goals]
    .sort((a, b) => Number(a.timeMin) - Number(b.timeMin) || String(a.timestamp).localeCompare(String(b.timestamp)))
    .forEach((goal) => {
      const nextHome = Number(goal.homeScore);
      const nextAway = Number(goal.awayScore);
      let creditedSide = nextHome > homeScore ? "home" : nextAway > awayScore ? "away" : "";
      const playerSide = contestantSide.get(String(goal.contestantId || "")) || "";
      if (!creditedSide) creditedSide = playerSide;
      if (!creditedSide) return;
      const ownGoal = playerSide && playerSide !== creditedSide
        || /og|own/i.test(String(goal.type || ""))
        || goal.ownGoal === true;
      const penalty = /pen|pg/i.test(String(goal.type || "")) || goal.penalty === true;
      const note = ownGoal ? " (OG)" : penalty ? " (p)" : "";
      const entry = `${compactText(goal.scorerName) || "Missing data"} ${goalMinute(goal)}${note}`;
      (creditedSide === "home" ? home : away).push(entry);
      if (Number.isFinite(nextHome)) homeScore = nextHome;
      if (Number.isFinite(nextAway)) awayScore = nextAway;
    });

  if (home.length + away.length !== listedGoals) {
    return { ...game, home_scorers: [], away_scorers: [] };
  }
  return { ...game, home_scorers: home, away_scorers: away };
}

async function mapConcurrent(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        output[index] = await mapper(items[index]);
      } catch (error) {
        console.warn(`Match details unavailable for ${items[index].id}: ${error.message}`);
        output[index] = items[index];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return output;
}

async function loadSeason(year, includeDetails, previous) {
  const competitionId = SEASONS[year];
  if (!competitionId) throw new Error(`Unsupported UAE Pro League season ${year}`);
  const [fixturesHtml, standingsHtml, scorersHtml] = await Promise.all([
    fetchHtmlEnvelope("/en/fixtures/matches", { seasonCompetitionId: competitionId, weekNumber: "", teamId: "" }),
    fetchHtmlEnvelope("/en/standings/list", { seasonCompetitionId: competitionId, teamId: "" }),
    fetchHtmlEnvelope("/en/stats/getPlayerStat", { seasonCompetition: competitionId, club: "", type: "65" })
  ]);
  const { games, teams } = parseFixtures(fixturesHtml);
  const table = parseStandings(standingsHtml, teams);
  const scorers = parseScorers(scorersHtml);
  const previousGames = new Map((previous?.games || []).map((game) => [String(game.id), game]));
  const merged = games.map((game) => {
    const old = previousGames.get(String(game.id));
    return old?.home_scorers?.length || old?.away_scorers?.length
      ? { ...game, home_scorers: old.home_scorers, away_scorers: old.away_scorers }
      : game;
  });
  const detailedGames = includeDetails
    ? await mapConcurrent(merged, 6, addMatchDetails)
    : merged;
  const teamCount = Math.max(table.length, teams.size);
  const gamesPerTeam = teamCount > 1 ? (teamCount - 1) * 2 : 26;
  table.forEach((row) => { row.total = gamesPerTeam; });

  return {
    year,
    season_label: `${year}/${String(year + 1).slice(-2)}`,
    games_per_team: gamesPerTeam,
    scorers_complete: scorers.length > 0,
    games: detailedGames,
    groups: table.length ? [{
      key: "uae-pro-league",
      name: "",
      display_name_en: "UAE Pro League",
      display_name_ar: "دوري أدنوك للمحترفين",
      teams: table
    }] : [],
    teams: [...teams.values()],
    scorers,
    liveFetchedAt: new Date().toISOString()
  };
}

async function main() {
  const options = args();
  const existing = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"))
    : { seasons: {} };
  const seasons = { ...(existing.seasons || {}) };
  for (const year of options.seasons) {
    const includeDetails = options.details || year === 2026;
    console.log(`Fetching UAE Pro League ${year}/${String(year + 1).slice(-2)}...`);
    seasons[String(year)] = await loadSeason(year, includeDetails, seasons[String(year)]);
  }
  const output = {
    generated_at: new Date().toISOString(),
    source: {
      name: "UAE Pro League",
      url: "https://www.uaepl.ae/en/fixtures"
    },
    seasons
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
