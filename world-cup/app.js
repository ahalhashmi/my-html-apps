const API = {
  games: "https://worldcup26.ir/get/games",
  groups: "https://worldcup26.ir/get/groups",
  teams: "https://worldcup26.ir/get/teams"
};

const FALLBACK_URL = "data/live-fallback.json";
const ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const API_TIMEOUT_MS = 6000;
const REFRESH_INTERVAL_MS = 60000;
const LANG_KEY = "worldCupLangV2";
const TIME_ZONE_KEY = "worldCupTimeZone";
const DEFAULT_TIME_ZONE = "UTC";
const ESPN_LOOKBACK_DAYS = 1;
const ESPN_LOOKAHEAD_DAYS = 1;
const SCORER_NAME_CORRECTIONS = {
  "CAN|c larin": "Cyle Larin",
  "CAN|kail larin": "Cyle Larin",
  "ENG|h kane": "Harry Kane",
  "ENG|hri kin": "Harry Kane",
  "GER|d undav": "Deniz Undav",
  "GER|dniz avndav": "Deniz Undav",
  "MEX|j quinones": "Julian Quinones",
  "MEX|jvlian kviinvnz": "Julian Quinones",
  "MAR|sofiane rahimi": "Soufiane Rahimi",
  "MAR|soufian rahimi": "Soufiane Rahimi",
  "MAR|soufiane rahimi": "Soufiane Rahimi",
  "MAR|sufiane rahimi": "Soufiane Rahimi",
  "MAR|sufyan rahimi": "Soufiane Rahimi",
  "MAR|svfian rhimi": "Soufiane Rahimi",
  "SUI|ruben vargas": "Ruben Vargas",
  "SUI|rvbn vargas": "Ruben Vargas",
  "USA|f balogun": "Folarin Balogun",
  "USA|flvrin balvgan": "Folarin Balogun"
};
const FALLBACK_TIME_ZONES = [
  "UTC",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Muscat",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Baghdad",
  "Asia/Amman",
  "Asia/Beirut",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Mexico_City"
];

const labels = {
  en: {
    langToggle: "عربي",
    themeDay: "Day",
    themeNight: "Night",
    matches: "Matches",
    groups: "Groups",
    knockout: "Knockout",
    scorers: "Scorers",
    timezoneButton: "Timezone",
    timezoneTitle: "Select timezone",
    timezoneApply: "Done",
    timezoneClose: "Close",
    tabsLabel: "World Cup views",
    loadError: "Could not load live data. Refresh the page.",
    unavailable: "The live API is unavailable right now.",
    done: "FT",
    live: "Live",
    highlights: "Match highlights",
    noGoals: "No goals",
    expandMatch: "Show match details",
    collapseMatch: "Hide match details",
    pointAbbr: "pts",
    visitors: "visitors",
    author: "Abdulla Alhashmi",
    standing: {
      team: "Team",
      played: "P",
      won: "W",
      drawn: "D",
      lost: "L",
      goalDifference: "GD",
      points: "Pts"
    },
    groupTitle(name) {
      return `Group ${name}`;
    }
  },
  ar: {
    langToggle: "English",
    themeDay: "نهاري",
    themeNight: "ليلي",
    matches: "المباريات",
    groups: "المجموعات",
    knockout: "خروج المغلوب",
    scorers: "الهدافين",
    timezoneButton: "التوقيت",
    timezoneTitle: "اختر التوقيت",
    timezoneApply: "تم",
    timezoneClose: "إغلاق",
    tabsLabel: "أقسام كأس العالم",
    loadError: "تعذر تحميل البيانات. حدّث الصفحة.",
    unavailable: "البيانات المباشرة غير متاحة الآن.",
    done: "نهاية",
    live: "مباشر",
    highlights: "ملخص المباراة",
    noGoals: "لا توجد أهداف",
    expandMatch: "عرض تفاصيل المباراة",
    collapseMatch: "إخفاء تفاصيل المباراة",
    pointAbbr: "نقطه",
    visitors: "الزوار",
    author: "عبدالله الهاشمي",
    standing: {
      team: "المنتخب",
      played: "ل",
      won: "ف",
      drawn: "تعادل",
      lost: "خ",
      goalDifference: "ف أ",
      points: "نقطه"
    },
    groupTitle(name) {
      return `Group ${name}`;
    }
  }
};

const groupLabels = {
  A: "الأولى",
  B: "الثانية",
  C: "الثالثة",
  D: "الرابعة",
  E: "الخامسة",
  F: "السادسة",
  G: "السابعة",
  H: "الثامنة",
  I: "التاسعة",
  J: "العاشرة",
  K: "الحادية عشرة",
  L: "الثانية عشرة"
};

const arabicTeamNames = {
  ALG: "الجزائر",
  ARG: "الأرجنتين",
  AUS: "أستراليا",
  AUT: "النمسا",
  BEL: "بلجيكا",
  BIH: "البوسنة والهرسك",
  BRA: "البرازيل",
  CAN: "كندا",
  CIV: "كوت ديفوار",
  COD: "جمهورية الكونغو",
  COL: "كولومبيا",
  CPV: "الرأس الأخضر",
  CRO: "كرواتيا",
  CUW: "كوراساو",
  CZE: "التشيك",
  ECU: "الإكوادور",
  EGY: "مصر",
  ENG: "إنجلترا",
  ESP: "إسبانيا",
  FRA: "فرنسا",
  GER: "ألمانيا",
  GHA: "غانا",
  HAI: "هايتي",
  IRN: "إيران",
  IRQ: "العراق",
  JOR: "الأردن",
  KOR: "جمهورية كوريا",
  KSA: "السعودية",
  MAR: "المغرب",
  MEX: "المكسيك",
  NED: "هولندا",
  NOR: "النرويج",
  NZL: "نيوزيلندا",
  PAN: "بنما",
  PAR: "باراغواي",
  POR: "البرتغال",
  QAT: "قطر",
  RSA: "جنوب أفريقيا",
  SCO: "اسكتلندا",
  SEN: "السنغال",
  SUI: "سويسرا",
  SWE: "السويد",
  TUN: "تونس",
  TUR: "تركيا",
  URU: "أوروغواي",
  USA: "الولايات المتحدة",
  UZB: "أوزبكستان"
};

const regionNamesAr = typeof Intl.DisplayNames === "function"
  ? new Intl.DisplayNames(["ar-AE"], { type: "region" })
  : null;

const stadiumUtcOffsets = {
  1: -6,
  2: -6,
  3: -6,
  4: -5,
  5: -5,
  6: -5,
  7: -4,
  8: -4,
  9: -4,
  10: -4,
  11: -4,
  12: -4,
  13: -7,
  14: -7,
  15: -7,
  16: -7
};

const roundNames = {
  group: "Group Stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  third: "Third Place",
  final: "Final"
};

const KNOCKOUT_BOARD = {
  width: 1320,
  height: 920,
  matchWidth: 116,
  matchHeight: 76
};

const KNOCKOUT_ZOOM_MIN = 0.45;
const KNOCKOUT_ZOOM_MAX = 1.5;
const KNOCKOUT_ZOOM_STEP = 0.1;

const knockoutRounds = {
  left: {
    r32: [74, 77, 73, 75, 83, 84, 81, 82],
    r16: [89, 90, 93, 94],
    qf: [97, 98],
    sf: [101]
  },
  right: {
    sf: [102],
    qf: [99, 100],
    r16: [91, 92, 95, 96],
    r32: [76, 78, 79, 80, 86, 88, 85, 87]
  },
  final: [104]
};

const knockoutParents = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102]
};

const state = {
  tab: "matches",
  lang: localStorage.getItem(LANG_KEY) === "en" ? "en" : "ar",
  timeZone: initialTimeZone(),
  games: [],
  groups: [],
  teams: [],
  liveGroupStats: new Map(),
  loadedAt: null,
  fallback: false,
  didInitialScroll: false,
  expandedMatchId: null,
  knockoutZoom: 0.58
};

const el = {
  title: document.querySelector("h1"),
  content: document.getElementById("content"),
  updatedAt: document.getElementById("updated-at"),
  authorCredit: document.getElementById("author-credit"),
  visitorLabel: document.getElementById("visitor-label"),
  langToggle: document.getElementById("lang-toggle"),
  timezoneToggle: document.getElementById("timezone-toggle"),
  timezonePanel: document.getElementById("timezone-panel"),
  timezoneSelect: document.getElementById("timezone-select"),
  timezoneTitle: document.getElementById("timezone-title"),
  timezoneApply: document.getElementById("timezone-apply"),
  timezoneClose: document.getElementById("timezone-close"),
  themeToggle: document.getElementById("theme-toggle"),
  visitorBadge: document.querySelector(".visitor-badge"),
  tabsNav: document.querySelector(".tabs"),
  tabs: [...document.querySelectorAll(".tab")]
};

const dateFormatOptions = {
  day: {
    weekday: "long",
    day: "numeric",
    month: "long"
  },
  time: {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  },
  stamp: {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }
};

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validTimeZone(timeZone) {
  if (!timeZone) return "";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(new Date());
    return timeZone;
  } catch (error) {
    return "";
  }
}

function browserTimeZone() {
  return validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function initialTimeZone() {
  return validTimeZone(localStorage.getItem(TIME_ZONE_KEY))
    || browserTimeZone()
    || DEFAULT_TIME_ZONE;
}

function localeCode() {
  return state.lang === "ar" ? "ar-AE-u-nu-latn" : "en-AE-u-nu-latn";
}

function t() {
  return labels[state.lang];
}

function formatDate(kind, date) {
  return new Intl.DateTimeFormat(localeCode(), {
    ...dateFormatOptions[kind],
    timeZone: state.timeZone
  }).format(date);
}

function timeZoneShortName(date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-AE-u-nu-latn", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: state.timeZone,
      timeZoneName: "shortOffset"
    }).formatToParts(date);
    return parts.find((part) => part.type === "timeZoneName")?.value || timeZoneCityLabel(state.timeZone);
  } catch (error) {
    return "GMT";
  }
}

function timeZoneCityLabel(timeZone) {
  if (timeZone === "UTC" || timeZone === "Etc/GMT") return "GMT";
  return timeZone.split("/").pop().replace(/_/g, " ");
}

function timeZoneOptionLabel(timeZone) {
  return `${timeZone.replace(/_/g, " ")} - ${timeZoneShortOffset(timeZone)}`;
}

function timeZoneShortOffset(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-AE-u-nu-latn", {
      hour: "2-digit",
      timeZone,
      timeZoneName: "shortOffset"
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  } catch (error) {
    return "GMT";
  }
}

function availableTimeZones() {
  const supported = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  return [...new Set([state.timeZone, browserTimeZone(), ...FALLBACK_TIME_ZONES, ...supported])]
    .filter(validTimeZone)
    .sort((a, b) => timeZoneOptionLabel(a).localeCompare(timeZoneOptionLabel(b)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function teamName(game, side) {
  return game[`${side}_team_name_en`] || game[`${side}_team_label`] || "TBA";
}

function teamId(game, side) {
  return game[`${side}_team_id`];
}

function isFinished(game) {
  return String(game.finished).toUpperCase() === "TRUE" || game.time_elapsed === "finished";
}

function isLive(game) {
  return !isFinished(game) && !["notstarted", "not_started", "", undefined, null].includes(game.time_elapsed);
}

function parseVenueDate(game) {
  const match = String(game.local_date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return new Date(0);
  const [, mm, dd, yyyy, hour, minute] = match;
  const offset = stadiumUtcOffsets[game.stadium_id] ?? 0;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hour) - offset, Number(minute)));
}

function hydrateGame(game) {
  const date = parseVenueDate(game);
  return {
    ...game,
    date,
    homeName: teamName(game, "home"),
    awayName: teamName(game, "away"),
    homeScore: numberValue(game.home_score),
    awayScore: numberValue(game.away_score),
    type: game.type || "group"
  };
}

function teamById(id) {
  return state.teams.find((team) => String(team.id) === String(id));
}

function teamCode(team, fallbackName) {
  if (team?.fifa_code) return team.fifa_code.toUpperCase();
  return compactLabel(fallbackName);
}

function matchTeamLabel(team, fallbackName) {
  if (state.lang !== "ar") return teamCode(team, fallbackName);
  if (team) return arabicTeamName(team, fallbackName);
  return arabicPlaceholderName(fallbackName);
}

function standingTeamName(team, fallbackName) {
  if (state.lang === "ar") return arabicTeamName(team, fallbackName);
  return team?.name_en || fallbackName;
}

function arabicTeamName(team, fallbackName) {
  const code = team?.fifa_code?.toUpperCase();
  if (code && arabicTeamNames[code]) return arabicTeamNames[code];
  const iso = team?.iso2?.toUpperCase();
  const regionName = regionNamesAr && /^[A-Z]{2}$/.test(iso) ? regionNamesAr.of(iso) : "";
  if (regionName) return regionName;
  return arabicPlaceholderName(fallbackName || team?.name_en || "TBA");
}

function arabicPlaceholderName(name) {
  const text = String(name || "");
  if (!text || text === "TBA") return "لم يحدد";
  return arabicKnockoutLabel(text);
}

function compactLabel(name) {
  const text = String(name || "TBA");
  const winnerMatch = text.match(/^Winner Match (\d+)$/i);
  if (winnerMatch) return `W${winnerMatch[1]}`;
  const loserMatch = text.match(/^Loser Match (\d+)$/i);
  if (loserMatch) return `L${loserMatch[1]}`;
  const winnerGroup = text.match(/^Winner Group ([A-L])$/i);
  if (winnerGroup) return `1${winnerGroup[1].toUpperCase()}`;
  const runnerGroup = text.match(/^Runner-up Group ([A-L])$/i);
  if (runnerGroup) return `2${runnerGroup[1].toUpperCase()}`;
  const thirdGroup = text.match(/^3rd Group (.+)$/i);
  if (thirdGroup) return `3${thirdGroup[1].replace(/[^A-L]/gi, "").slice(0, 2).toUpperCase()}`;
  return text
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3) || "TBA";
}

function cacheBustedUrl(url) {
  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
}

function addUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function espnDateKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function espnScoreboardUrl() {
  const now = new Date();
  const start = espnDateKey(addUtcDays(now, -ESPN_LOOKBACK_DAYS));
  const end = espnDateKey(addUtcDays(now, ESPN_LOOKAHEAD_DAYS));
  return `${ESPN_SCOREBOARD_URL}?dates=${start}-${end}&limit=60`;
}

function normalizeCode(code) {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function teamCodeFromData(teams, id, fallbackName) {
  const team = teams.find((item) => String(item.id) === String(id));
  return normalizeCode(team?.fifa_code) || normalizeCode(compactLabel(fallbackName));
}

function gameTeamCode(teams, game, side) {
  return teamCodeFromData(teams, teamId(game, side), teamName(game, side));
}

function espnScoringPlays(competition, homeId, awayId) {
  return (competition.details || []).reduce((scorers, detail) => {
    if (!detail?.scoringPlay || detail.shootout) return scorers;

    const teamIdValue = String(detail.team?.id || "");
    const athlete = detail.athletesInvolved?.[0] || {};
    const player = String(athlete.displayName || athlete.shortName || athlete.fullName || "Goal").trim();
    const minute = String(detail.clock?.displayValue || "").trim();
    const note = detail.ownGoal ? " (OG)" : detail.penaltyKick ? " (p)" : "";
    const scorer = `${player}${minute ? ` ${minute}` : ""}${note}`.trim();

    if (teamIdValue === String(homeId)) scorers.home.push(scorer);
    if (teamIdValue === String(awayId)) scorers.away.push(scorer);
    return scorers;
  }, { home: [], away: [] });
}

function normalizeEspnEvent(event) {
  const competition = event?.competitions?.[0] || {};
  const competitors = competition.competitors || [];
  const home = competitors.find((item) => item.homeAway === "home");
  const away = competitors.find((item) => item.homeAway === "away");
  const date = new Date(competition.date || event.date);
  if (!home || !away || Number.isNaN(date.getTime())) return null;

  const status = competition.status || event.status || {};
  const type = status.type || {};
  const stateName = String(type.state || "").toLowerCase();
  const statusName = String(type.name || "").toUpperCase();
  const finished = type.completed === true || stateName === "post";
  const live = !finished && (
    stateName === "in"
    || statusName.includes("IN_PROGRESS")
    || statusName.includes("HALFTIME")
    || statusName.includes("BREAK")
  );
  const displayClock = status.displayClock || event.status?.displayClock || type.shortDetail || type.detail;
  const scoringPlays = espnScoringPlays(competition, home.team?.id, away.team?.id);

  return {
    date,
    homeCode: normalizeCode(home.team?.abbreviation),
    awayCode: normalizeCode(away.team?.abbreviation),
    homeScore: numberValue(home.score),
    awayScore: numberValue(away.score),
    homeScorers: scoringPlays.home,
    awayScorers: scoringPlays.away,
    finished,
    live,
    elapsed: finished ? "finished" : live ? (displayClock || "live") : "notstarted"
  };
}

function findEspnMatch(game, teams, events) {
  const homeCode = gameTeamCode(teams, game, "home");
  const awayCode = gameTeamCode(teams, game, "away");
  if (!homeCode || !awayCode) return null;

  const date = parseVenueDate(game);
  const time = date.getTime();
  return events.find((event) => {
    const sameDirection = event.homeCode === homeCode && event.awayCode === awayCode;
    const reversed = event.homeCode === awayCode && event.awayCode === homeCode;
    const closeTime = Math.abs(event.date.getTime() - time) <= 6 * 60 * 60 * 1000;
    return (sameDirection || reversed) && closeTime;
  });
}

function mergeEspnScores(games, teams, events) {
  const normalizedEvents = (events || []).map(normalizeEspnEvent).filter(Boolean);
  if (!normalizedEvents.length) return games;

  return games.map((game) => {
    const event = findEspnMatch(game, teams, normalizedEvents);
    if (!event || (!event.finished && !event.live)) return game;

    const sameDirection = event.homeCode === gameTeamCode(teams, game, "home");
    return {
      ...game,
      home_score: String(sameDirection ? event.homeScore : event.awayScore),
      away_score: String(sameDirection ? event.awayScore : event.homeScore),
      ...(sameDirection && event.homeScorers.length ? { home_scorers: event.homeScorers } : {}),
      ...(sameDirection && event.awayScorers.length ? { away_scorers: event.awayScorers } : {}),
      ...(!sameDirection && event.awayScorers.length ? { home_scorers: event.awayScorers } : {}),
      ...(!sameDirection && event.homeScorers.length ? { away_scorers: event.homeScorers } : {}),
      finished: event.finished ? "TRUE" : "FALSE",
      time_elapsed: event.elapsed
    };
  });
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(cacheBustedUrl(url), {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function addFastScoreData(data) {
  try {
    const scoreboard = await getJson(espnScoreboardUrl());
    return {
      ...data,
      games: mergeEspnScores(data.games || [], data.teams || [], scoreboard.events || []),
      liveFetchedAt: new Date().toISOString()
    };
  } catch (error) {
    return data;
  }
}

async function loadData() {
  let data;
  let fallback = false;

  try {
    const [games, groups, teams] = await Promise.all([
      getJson(API.games),
      getJson(API.groups),
      getJson(API.teams)
    ]);
    data = {
      games: games.games || [],
      groups: groups.groups || [],
      teams: teams.teams || []
    };
  } catch (error) {
    const response = await fetch(cacheBustedUrl(FALLBACK_URL), { cache: "no-store" });
    if (!response.ok) throw error;
    data = await response.json();
    fallback = true;
  }

  applyData(await addFastScoreData(data), fallback);
}

function applyData(data, fallback) {
  state.games = (data.games || []).map(hydrateGame).sort((a, b) => a.date - b.date);
  state.groups = data.groups || [];
  state.teams = data.teams || [];
  state.liveGroupStats = computeLiveGroupStats();
  const liveTime = data.liveFetchedAt ? new Date(data.liveFetchedAt) : null;
  const fallbackTime = fallback && data.fetchedAt ? new Date(data.fetchedAt) : null;
  state.loadedAt = liveTime && !Number.isNaN(liveTime.getTime())
    ? liveTime
    : fallbackTime && !Number.isNaN(fallbackTime.getTime())
      ? fallbackTime
      : new Date();
  state.fallback = fallback;
  render();
}

function computeLiveGroupStats() {
  const stats = new Map();

  state.groups.forEach((group) => {
    group.teams.forEach((team) => {
      stats.set(String(team.team_id), {
        played: 0,
        total: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        pts: 0
      });
    });
  });

  state.games
    .filter((game) => game.type === "group")
    .forEach((game) => {
      const homeId = String(teamId(game, "home"));
      const awayId = String(teamId(game, "away"));
      const home = stats.get(homeId);
      const away = stats.get(awayId);
      if (!home || !away) return;

      home.total += 1;
      away.total += 1;

      if (!isFinished(game) && !isLive(game)) return;

      home.played += 1;
      away.played += 1;
      home.gf += game.homeScore;
      home.ga += game.awayScore;
      away.gf += game.awayScore;
      away.ga += game.homeScore;
      home.gd = home.gf - home.ga;
      away.gd = away.gf - away.ga;

      if (game.homeScore > game.awayScore) {
        home.w += 1;
        away.l += 1;
        home.pts += 3;
      } else if (game.awayScore > game.homeScore) {
        away.w += 1;
        home.l += 1;
        away.pts += 3;
      } else {
        home.d += 1;
        away.d += 1;
        home.pts += 1;
        away.pts += 1;
      }
    });

  return stats;
}

function setUpdatedAt(text) {
  el.updatedAt.textContent = text;
}

function render() {
  setUpdatedAt(formatDate("stamp", state.loadedAt));

  if (state.tab === "matches") renderMatches();
  if (state.tab === "groups") renderGroups();
  if (state.tab === "knockout") renderKnockout();
  if (state.tab === "scorers") renderScorers();
}

function renderMatches() {
  const lastFinished = [...state.games].reverse().find(isFinished);
  const targetDay = lastFinished ? formatDate("day", lastFinished.date) : "";
  const days = groupBy(state.games, (game) => formatDate("day", game.date));
  el.content.innerHTML = Object.entries(days).map(([day, games]) => `
    <section class="day ${day === targetDay ? "is-scroll-target-day" : ""}">
      <h2 class="day-title">${escapeHtml(day)}</h2>
      ${games.map((game) => matchCard(game, lastFinished?.id === game.id)).join("")}
    </section>
  `).join("");

  if (!state.didInitialScroll && lastFinished) {
    state.didInitialScroll = true;
    requestAnimationFrame(() => {
      const target = document.querySelector(".day.is-scroll-target-day");
      if (!target) return;
      const offset = document.querySelector(".tabs")?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }
}

function renderGroups() {
  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name));
  const standing = t().standing;
  el.content.innerHTML = groups.map((group) => `
    <section class="group-card">
      <h2 class="group-title">${escapeHtml(t().groupTitle(group.name))}</h2>
      <table class="standing">
        <thead>
          <tr>
            <th>${escapeHtml(standing.team)}</th>
            <th>${escapeHtml(standing.played)}</th>
            <th>${escapeHtml(standing.won)}</th>
            <th>${escapeHtml(standing.drawn)}</th>
            <th>${escapeHtml(standing.lost)}</th>
            <th>${escapeHtml(standing.goalDifference)}</th>
            <th>${escapeHtml(standing.points)}</th>
          </tr>
        </thead>
        <tbody>
          ${sortedGroupTeams(group.teams).map(standingRow).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
}

function renderKnockout() {
  const layout = knockoutLayout();
  const scaleWidth = Math.ceil(KNOCKOUT_BOARD.width * state.knockoutZoom);
  const scaleHeight = Math.ceil(KNOCKOUT_BOARD.height * state.knockoutZoom);

  el.content.innerHTML = `
    <section class="knockout-panel">
      <div class="knockout-controls">
        <button class="knockout-zoom" type="button" data-knockout-zoom="out" aria-label="Zoom out">-</button>
        <button class="knockout-zoom" type="button" data-knockout-zoom="reset" aria-label="Reset zoom">1x</button>
        <button class="knockout-zoom" type="button" data-knockout-zoom="in" aria-label="Zoom in">+</button>
      </div>
      <div class="knockout-viewport">
        <div class="knockout-scale" style="--knockout-zoom: ${state.knockoutZoom}; width: ${scaleWidth}px; height: ${scaleHeight}px;">
          <div class="knockout-board">
            <svg class="knockout-lines" viewBox="0 0 ${KNOCKOUT_BOARD.width} ${KNOCKOUT_BOARD.height}" aria-hidden="true">
              ${knockoutLines(layout)}
            </svg>
            ${layout.map(knockoutMatchNode).join("")}
          </div>
        </div>
      </div>
    </section>
  `;

  requestAnimationFrame(() => {
    const viewport = el.content.querySelector(".knockout-viewport");
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
  });
}

function renderScorers() {
  const scorers = topScorers();
  el.content.innerHTML = `
    <section class="scorers-list">
      ${scorers.length ? scorers.map(scorerRow).join("") : `<div class="empty">${escapeHtml(t().noGoals)}</div>`}
    </section>
  `;
}

function topScorers() {
  const entries = scorerGoalEntries();
  const likelyOwnGoals = likelyOwnGoalKeys(entries);
  const goals = entries.filter((goal) => !likelyOwnGoals.has(goal.entryKey));
  const aliases = scorerAliasMap(goals);
  const scorers = new Map();

  goals.forEach(({ name, team }) => {
    const canonicalName = aliases.get(scorerIdentityKey(name, team.code)) || name;
    const key = scorerIdentityKey(canonicalName, team.code);
    if (!key) return;

    const entry = scorers.get(key) || {
      name: canonicalName,
      goals: 0,
      flag: team.flag,
      code: team.code
    };
    entry.goals += 1;
    entry.name = bestScorerDisplayName(entry.name, canonicalName);
    if (!entry.flag && team.flag) entry.flag = team.flag;
    if (!entry.code && team.code) entry.code = team.code;
    scorers.set(key, entry);
  });

  return [...scorers.values()]
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .map((scorer, index) => ({ ...scorer, rank: index + 1 }));
}

function scorerGoalEntries() {
  return state.games
    .filter((game) => isFinished(game) || isLive(game))
    .flatMap((game) => goalScorers(game)
      .filter((goal) => !isOwnGoal(goal))
      .map((goal) => {
        const team = scorerTeam(game, goal);
        const opponent = scorerOpponentTeam(game, goal);
        const name = canonicalScorerName(cleanScorerName(goal.player), team.code);
        return {
          name,
          team,
          opponent,
          gameId: String(game.id || game._id || ""),
          side: goal.side,
          sort: goal.sort,
          entryKey: scorerGoalEntryKey(game, goal, name)
        };
      })
      .filter((goal) => scorerKey(goal.name)));
}

function canonicalScorerName(name, code) {
  return SCORER_NAME_CORRECTIONS[`${code || ""}|${scorerKey(name)}`] || name;
}

function likelyOwnGoalKeys(goals) {
  const likelyOwnGoals = new Set();
  const byName = new Map();

  goals.forEach((goal) => {
    const key = scorerKey(goal.name);
    const current = byName.get(key) || [];
    current.push(goal);
    byName.set(key, current);
  });

  byName.forEach((items) => {
    const teamCodes = new Set(items.map((item) => item.team.code).filter(Boolean));
    if (teamCodes.size < 2) return;

    const opponentCodes = items.map((item) => item.opponent.code).filter(Boolean);
    const likelyTeam = opponentCodes.find((code) => opponentCodes.every((value) => value === code));
    if (likelyTeam) {
      items
        .filter((item) => item.team.code !== likelyTeam)
        .forEach((item) => likelyOwnGoals.add(item.entryKey));
    }

    const byGame = new Map();
    items.forEach((item) => {
      const current = byGame.get(item.gameId) || [];
      current.push(item);
      byGame.set(item.gameId, current);
    });

    byGame.forEach((gameItems) => {
      const sides = new Set(gameItems.map((item) => item.side));
      if (sides.size < 2) return;
      [...gameItems]
        .sort((a, b) => a.sort - b.sort)
        .slice(1)
        .forEach((item) => likelyOwnGoals.add(item.entryKey));
    });
  });

  return likelyOwnGoals;
}

function scorerAliasMap(goals) {
  const fullByLastName = new Map();

  goals.forEach(({ name, team }) => {
    if (isAbbreviatedScorerName(name)) return;
    const parts = scorerNameParts(name);
    if (parts.length < 2) return;
    const key = scorerLastNameKey(team.code, parts[parts.length - 1]);
    const current = fullByLastName.get(key) || new Map();
    current.set(scorerKey(name), name);
    fullByLastName.set(key, current);
  });

  const aliases = new Map();
  goals.forEach(({ name, team }) => {
    if (!isAbbreviatedScorerName(name)) return;
    const parts = scorerNameParts(name);
    const candidates = [...(fullByLastName.get(scorerLastNameKey(team.code, parts[parts.length - 1])) || new Map()).values()];
    const matchingInitial = candidates.filter((candidate) => scorerNameParts(candidate)[0]?.[0] === parts[0]);
    const match = matchingInitial.length === 1 ? matchingInitial[0] : candidates.length === 1 ? candidates[0] : "";
    if (match) aliases.set(scorerIdentityKey(name, team.code), match);
  });

  return aliases;
}

function scorerKey(name) {
  return latinizeText(cleanScorerName(name))
    .toLowerCase()
    .replace(/([a-z])\.(?=[a-z])/g, "$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanScorerName(name) {
  return String(name || "")
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+\d{1,3}(?:'?\+\d{1,2})?'?\s*(?:\((?:p|pen|og|o\.g\.)\))?$/i, "")
    .replace(/\s+\(?o\.?\s*g\.?\)?$/i, "")
    .replace(/\s+\(?p\)?$/i, "")
    .trim();
}

function latinizeText(value) {
  return String(value || "")
    .replace(/[øØ]/g, (letter) => letter === "Ø" ? "O" : "o")
    .replace(/[ðÐ]/g, (letter) => letter === "Ð" ? "D" : "d")
    .replace(/[þÞ]/g, (letter) => letter === "Þ" ? "Th" : "th")
    .replace(/[łŁ]/g, (letter) => letter === "Ł" ? "L" : "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function scorerIdentityKey(name, code) {
  const key = scorerKey(name);
  return key ? `${code || ""}|${key}` : "";
}

function scorerNameParts(name) {
  return scorerKey(name).split(" ").filter(Boolean);
}

function scorerLastNameKey(code, lastName) {
  return `${code || ""}|${lastName || ""}`;
}

function isAbbreviatedScorerName(name) {
  const parts = scorerNameParts(name);
  return parts.length === 2 && parts[0].length === 1 && parts[1].length > 1;
}

function bestScorerDisplayName(current, candidate) {
  if (!current) return candidate;
  if (isAbbreviatedScorerName(current) && !isAbbreviatedScorerName(candidate)) return candidate;
  return candidate.length > current.length && isAbbreviatedScorerName(current) === isAbbreviatedScorerName(candidate)
    ? candidate
    : current;
}

function isOwnGoal(goal) {
  return isOwnGoalText(`${goal.note || ""} ${goal.raw || ""}`);
}

function isOwnGoalText(value) {
  return /(?:^|[\s(])o\.?\s*g\.?(?:[\s)]|$)|\bown\s+goal\b/i.test(String(value || ""));
}

function scorerTeam(game, goal) {
  const side = goal.side === "away" ? "away" : "home";
  const team = teamById(teamId(game, side));
  const name = side === "home" ? game.homeName : game.awayName;
  return {
    flag: team?.flag || "",
    code: teamCode(team, name)
  };
}

function scorerOpponentTeam(game, goal) {
  const side = goal.side === "away" ? "home" : "away";
  const team = teamById(teamId(game, side));
  const name = side === "home" ? game.homeName : game.awayName;
  return {
    flag: team?.flag || "",
    code: teamCode(team, name)
  };
}

function scorerGoalEntryKey(game, goal, name) {
  return [
    game.id || game._id || "",
    goal.side || "",
    goal.sort || "",
    scorerKey(name)
  ].join("|");
}

function scorerRow(scorer) {
  return `
    <article class="scorer-row">
      <span class="scorer-rank">${escapeHtml(scorer.rank)}</span>
      <span class="scorer-identity">
        ${scorer.flag ? `<img class="scorer-flag" src="${escapeHtml(scorer.flag)}" alt="">` : `<span class="scorer-flag scorer-flag--empty"></span>`}
        <span class="scorer-name">${escapeHtml(scorer.name)}</span>
      </span>
      <span class="scorer-goals">${escapeHtml(scorer.goals)}</span>
    </article>
  `;
}

function knockoutLayout() {
  const positions = [];
  const leftX = { r32: 22, r16: 198, qf: 374, sf: 525 };
  const rightX = { sf: 679, qf: 830, r16: 1006, r32: 1182 };
  const yRanges = {
    r32: [18, 826],
    r16: [76, 768],
    qf: [200, 644],
    sf: [422, 422],
    final: [422, 422]
  };

  Object.entries(knockoutRounds.left).forEach(([round, ids]) => {
    ids.forEach((id, index) => positions.push(knockoutPosition(id, leftX[round], spacedY(index, ids.length, ...yRanges[round]), "left")));
  });
  Object.entries(knockoutRounds.right).forEach(([round, ids]) => {
    ids.forEach((id, index) => positions.push(knockoutPosition(id, rightX[round], spacedY(index, ids.length, ...yRanges[round]), "right")));
  });
  positions.push(knockoutPosition(knockoutRounds.final[0], 602, yRanges.final[0], "center"));

  return positions;
}

function knockoutPosition(id, x, y, side) {
  return { id: String(id), x, y, side, game: state.games.find((game) => String(game.id) === String(id)) };
}

function spacedY(index, count, start, end) {
  if (count <= 1) return start;
  return Math.round(start + ((end - start) * index) / (count - 1));
}

function knockoutLines(layout) {
  const byId = new Map(layout.map((item) => [item.id, item]));
  return Object.entries(knockoutParents).map(([childId, parentIds]) => {
    const child = byId.get(String(childId));
    if (!child) return "";
    return parentIds.map((parentId) => knockoutLine(byId.get(String(parentId)), child)).join("");
  }).join("");
}

function knockoutLine(from, to) {
  if (!from || !to) return "";
  const fromRight = from.x < to.x;
  const startX = from.x + (fromRight ? KNOCKOUT_BOARD.matchWidth : 0);
  const startY = from.y + KNOCKOUT_BOARD.matchHeight / 2;
  const endX = to.x + (fromRight ? 0 : KNOCKOUT_BOARD.matchWidth);
  const endY = to.y + KNOCKOUT_BOARD.matchHeight / 2;
  const midX = Math.round((startX + endX) / 2);
  return `<path d="M ${startX} ${startY} H ${midX} V ${endY} H ${endX}" />`;
}

function knockoutMatchNode(item) {
  return `
    <article class="knockout-match knockout-match--${escapeHtml(item.side)}" style="left: ${item.x}px; top: ${item.y}px;">
      ${knockoutTeam(item.game, "home")}
      ${knockoutTeam(item.game, "away")}
    </article>
  `;
}

function knockoutTeam(game, side) {
  const team = game ? teamById(teamId(game, side)) : null;
  const name = game ? (side === "home" ? game.homeName : game.awayName) : "TBA";
  const code = bracketTeamCode(team, name);
  const result = game ? sideResult(game, side) : "";
  return `
    <span class="knockout-team ${result ? `is-${result}` : ""}">
      ${team?.flag ? `<img class="knockout-flag" src="${escapeHtml(team.flag)}" alt="">` : `<span class="knockout-flag knockout-flag--empty"></span>`}
      <span class="knockout-code">${escapeHtml(code)}</span>
    </span>
  `;
}

function bracketTeamCode(team, fallbackName) {
  if (team?.fifa_code) return team.fifa_code.toUpperCase().slice(0, 3);
  const text = String(fallbackName || "");
  if (!text || text === "TBA" || /^(Winner|Loser|Runner-up|3rd) /i.test(text)) return "TBA";
  return compactLabel(text).slice(0, 3).padEnd(3, "X");
}

function sideResult(game, side) {
  if (!isFinished(game)) return "";
  if (game.homeScore > game.awayScore) return side === "home" ? "winner" : "loser";
  if (game.awayScore > game.homeScore) return side === "away" ? "winner" : "loser";

  const homePenalty = penaltyScore(game.home_penalty_score);
  const awayPenalty = penaltyScore(game.away_penalty_score);
  if (homePenalty === null || awayPenalty === null || homePenalty === awayPenalty) return "";
  return homePenalty > awayPenalty
    ? (side === "home" ? "winner" : "loser")
    : (side === "away" ? "winner" : "loser");
}

function matchCard(game, isScrollTarget = false) {
  const status = statusLabel(game);
  const side = isFinished(game) || isLive(game)
    ? scoreLine(game)
    : `<span class="time">${formatDate("time", game.date)}</span>`;
  const stateClass = isLive(game) ? "is-live" : isFinished(game) ? "is-done" : "is-pending";
  const isDone = isFinished(game);
  const isExpanded = isDone && state.expandedMatchId === matchKey(game);
  const card = `
    ${teamLine(game, "home")}
    <div class="match-center">
      <span class="pill stage">${escapeHtml(matchStageLabel(game))}</span>
      ${side}
      <span class="pill ${status.className}">${escapeHtml(status.text)}</span>
    </div>
    ${teamLine(game, "away")}
  `;

  return `
    <article class="match-wrap ${isExpanded ? "is-expanded" : ""}">
      ${isDone ? `
        <button class="match ${stateClass} ${isScrollTarget ? "is-scroll-target" : ""}" type="button" data-match-toggle="${escapeHtml(matchKey(game))}" aria-expanded="${isExpanded}" aria-controls="${escapeHtml(matchDetailsId(game))}" aria-label="${escapeHtml(isExpanded ? t().collapseMatch : t().expandMatch)}">
          ${card}
        </button>
        ${isExpanded ? matchDetails(game) : ""}
      ` : `
        <div class="match ${stateClass} ${isScrollTarget ? "is-scroll-target" : ""}">
          ${card}
        </div>
      `}
    </article>
  `;
}

function matchKey(game) {
  return String(game.id || game._id || "");
}

function matchDetailsId(game) {
  return `match-details-${matchKey(game).replace(/[^A-Za-z0-9_-]/g, "")}`;
}

function matchStageLabel(game) {
  if (game.type === "group" && game.group) return `Group ${String(game.group).toUpperCase()}`;
  return roundNames[game.type] || game.type || "";
}

function scoreLine(game) {
  const penalty = penaltyResult(game);
  if (!penalty) return `<span class="scoreline">${escapeHtml(scoreText(game))}</span>`;

  const home = scorePart(game.homeScore, penalty.home);
  const away = scorePart(game.awayScore, penalty.away);
  const parts = state.lang === "ar" ? [away, home] : [home, away];
  return `
    <span class="scoreline scoreline--penalties">
      ${parts[0]}
      <span class="score-separator">-</span>
      ${parts[1]}
    </span>
  `;
}

function scoreText(game) {
  return state.lang === "ar"
    ? `${game.awayScore} - ${game.homeScore}`
    : `${game.homeScore} - ${game.awayScore}`;
}

function scorePart(score, result) {
  return `
    <span class="score-part score-part--${escapeHtml(result)}">
      <span class="score-number">${escapeHtml(score)}</span>
      <span class="score-result">${escapeHtml(resultLabel(result))}</span>
    </span>
  `;
}

function resultLabel(result) {
  if (state.lang === "ar") return result === "winner" ? "ف" : "خ";
  return result === "winner" ? "W" : "L";
}

function penaltyResult(game) {
  if (game.type === "group" || !isFinished(game) || game.homeScore !== game.awayScore) return null;

  const homePenalty = penaltyScore(game.home_penalty_score);
  const awayPenalty = penaltyScore(game.away_penalty_score);
  if (homePenalty === null || awayPenalty === null || homePenalty === awayPenalty) return null;

  return homePenalty > awayPenalty
    ? { home: "winner", away: "loser" }
    : { home: "loser", away: "winner" };
}

function penaltyScore(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().toLowerCase();
  if (!text || text === "null") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function youtubeSearchLabel(game) {
  const home = searchTeamName(game, "home");
  const away = searchTeamName(game, "away");
  return state.lang === "ar"
    ? `ملخص كأس العالم ٢٠٢٦ ${home} و ${away}`
    : `world cup 2026 highlights ${home} x ${away}`;
}

function youtubeSearchUrl(game) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearchLabel(game))}`;
}

function matchDetails(game) {
  const scorers = goalScorers(game);
  return `
    <div class="match-details" id="${escapeHtml(matchDetailsId(game))}">
      <div class="goal-list">
        ${scorers.length ? scorers.map(goalRow).join("") : `<div class="no-goals">${escapeHtml(t().noGoals)}</div>`}
      </div>
      <a class="highlight-button" href="${escapeHtml(youtubeSearchUrl(game))}" target="_blank" rel="noopener">
        ${escapeHtml(t().highlights)}
      </a>
    </div>
  `;
}

function goalScorers(game) {
  return [
    ...parseScorers(game.home_scorers, "home"),
    ...parseScorers(game.away_scorers, "away")
  ].sort((a, b) => a.sort - b.sort);
}

function parseScorers(value, side) {
  return scorerItems(value).map((item) => {
    const parsed = parseScorerText(item);
    return {
      ...parsed,
      raw: item,
      side,
      sort: minuteSortValue(parsed.minute)
    };
  });
}

function scorerItems(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  const text = String(value || "").trim();
  if (!text || text.toLowerCase() === "null" || text === "{}") return [];

  const normalized = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  const quoted = [...normalized.matchAll(/"([^"]+)"/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (quoted.length) return quoted;

  return normalized
    .replace(/^[{\[]/, "")
    .replace(/[}\]]$/, "")
    .split(/\s*,\s*/)
    .map((item) => item.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

function parseScorerText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const match = text.match(/^(.*?)\s+(\d{1,3})(?:'?\+(\d{1,2}))?'?\s*(.*)$/);
  if (!match) {
    return {
      player: cleanScorerName(text),
      minute: "",
      note: normalizeScorerNote(text)
    };
  }

  return {
    player: cleanScorerName(match[1]),
    minute: `${match[2]}${match[3] ? `+${match[3]}` : ""}'`,
    note: normalizeScorerNote(match[4])
  };
}

function normalizeScorerNote(value) {
  const text = String(value || "").trim().replace(/^['"]+|['"]+$/g, "");
  if (!text) return "";
  if (isOwnGoalText(text)) return "(OG)";
  if (/^\(?p\)?$|\bpen(?:alty)?\b/i.test(text)) return "(p)";
  return text;
}

function minuteSortValue(minute) {
  const match = String(minute || "").match(/^(\d{1,3})(?:'?\+(\d{1,2}))?'?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 100 + Number(match[2] || 0);
}

function visualGoalSide(goal) {
  const homeIsLeft = state.lang !== "ar";
  if (goal.side === "home") return homeIsLeft ? "left" : "right";
  return homeIsLeft ? "right" : "left";
}

function goalName(goal) {
  return `
    <span class="goal-player">${escapeHtml(goal.player)}${goal.note ? ` <span class="goal-note">${escapeHtml(goal.note)}</span>` : ""}</span>
  `;
}

function goalRow(goal) {
  const side = visualGoalSide(goal);
  const left = side === "left" ? goalName(goal) : "";
  const right = side === "right" ? goalName(goal) : "";
  return `
    <div class="goal-row goal-row--${side}">
      <span class="goal-side goal-side--left">${left}</span>
      <span class="goal-minute">${escapeHtml(goal.minute)}</span>
      <span class="goal-side goal-side--right">${right}</span>
    </div>
  `;
}

function searchTeamName(game, side) {
  const team = teamById(teamId(game, side));
  const name = side === "home" ? game.homeName : game.awayName;
  return state.lang === "ar" ? matchTeamLabel(team, name) : name;
}

function teamLine(game, side) {
  const team = teamById(teamId(game, side));
  const name = side === "home" ? game.homeName : game.awayName;
  const code = teamCode(team, name);
  const label = matchTeamLabel(team, name);
  const detail = game.type === "group" && team
    ? groupProgressLines(team.id)
    : { top: knockoutLabelText(name), bottom: "" };

  return `
    <span class="team-flag team-flag--${side}">
      ${team?.flag ? `<img class="flag" src="${escapeHtml(team.flag)}" alt="">` : `<span class="flag placeholder">${escapeHtml(code)}</span>`}
    </span>
    <span class="team-detail team-detail--${side}">
      <span>${escapeHtml(detail.top)}</span>
      ${detail.bottom ? `<span>${escapeHtml(detail.bottom)}</span>` : ""}
    </span>
    <span class="team-name team-name--${side}">${escapeHtml(label)}</span>
  `;
}

function groupProgressLines(teamIdValue) {
  const stats = state.liveGroupStats.get(String(teamIdValue));
  if (!stats) return { top: "0/3", bottom: `0 ${t().pointAbbr}` };
  const total = stats.total || 3;
  return {
    top: `${stats.played}/${total}`,
    bottom: `${stats.pts} ${t().pointAbbr}`
  };
}

function knockoutLabelText(name) {
  const text = String(name || "");
  if (state.lang === "ar") return arabicKnockoutLabel(text);
  if (/^(Winner|Loser) Match/i.test(text)) return text.replace("Match", "M");
  if (/^Winner Group/i.test(text)) return text.replace("Winner Group", "1st Group");
  if (/^Runner-up Group/i.test(text)) return text.replace("Runner-up Group", "2nd Group");
  return text;
}

function arabicKnockoutLabel(name) {
  const text = String(name || "");
  const winnerMatch = text.match(/^Winner Match (\d+)$/i);
  if (winnerMatch) return `الفائز من المباراة ${winnerMatch[1]}`;
  const loserMatch = text.match(/^Loser Match (\d+)$/i);
  if (loserMatch) return `الخاسر من المباراة ${loserMatch[1]}`;
  const winnerGroup = text.match(/^Winner Group ([A-L])$/i);
  if (winnerGroup) return `أول المجموعة ${groupLabels[winnerGroup[1].toUpperCase()] || winnerGroup[1].toUpperCase()}`;
  const runnerGroup = text.match(/^Runner-up Group ([A-L])$/i);
  if (runnerGroup) return `ثاني المجموعة ${groupLabels[runnerGroup[1].toUpperCase()] || runnerGroup[1].toUpperCase()}`;
  const thirdGroup = text.match(/^3rd Group (.+)$/i);
  if (thirdGroup) return `ثالث المجموعة ${thirdGroup[1].replace(/[^A-L]/gi, "").toUpperCase()}`;
  return text || "لم يحدد";
}

function statusLabel(game) {
  if (isFinished(game)) return { text: t().done, className: "done" };
  if (isLive(game)) return { text: `${game.time_elapsed}`, className: "live" };
  return { text: timeZoneShortName(game.date), className: "" };
}

function sortedGroupTeams(teams) {
  return teams.map(liveStandingRow).sort((a, b) => {
    return numberValue(b.pts) - numberValue(a.pts)
      || numberValue(b.gd) - numberValue(a.gd)
      || numberValue(b.gf) - numberValue(a.gf)
      || (teamById(a.team_id)?.name_en || "").localeCompare(teamById(b.team_id)?.name_en || "");
  });
}

function liveStandingRow(row) {
  const live = state.liveGroupStats.get(String(row.team_id));
  if (!live) return row;
  return {
    ...row,
    mp: live.played,
    w: live.w,
    d: live.d,
    l: live.l,
    gf: live.gf,
    ga: live.ga,
    gd: live.gd,
    pts: live.pts
  };
}

function standingRow(row) {
  const team = teamById(row.team_id);
  const name = standingTeamName(team, `Team ${row.team_id}`);
  const placeholder = state.lang === "ar" ? matchTeamLabel(team, name) : initials(name);
  return `
    <tr>
      <td>
        <div class="team-cell">
          ${team?.flag ? `<img class="flag" src="${escapeHtml(team.flag)}" alt="">` : `<span class="flag placeholder">${escapeHtml(placeholder)}</span>`}
          <span>${escapeHtml(name)}</span>
        </div>
      </td>
      <td>${row.mp}</td>
      <td>${row.w}</td>
      <td>${row.d}</td>
      <td>${row.l}</td>
      <td>${row.gd}</td>
      <td><strong>${row.pts}</strong></td>
    </tr>
  `;
}

function groupBy(items, keyFn) {
  return items.reduce((groups, item) => {
    const key = keyFn(item);
    groups[key] ||= [];
    groups[key].push(item);
    return groups;
  }, {});
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function visitorBadgeUrl() {
  return "https://hits.sh/ahalhashmi.github.io/my-html-apps/world-cup.svg?label=%20&color=0f766e&labelColor=232f2d";
}

function updateStaticText() {
  document.title = state.lang === "ar" ? "كأس العالم 2026" : "World Cup 2026";
  el.title.textContent = document.title;
  el.langToggle.textContent = t().langToggle;
  el.timezoneToggle.textContent = t().timezoneButton;
  el.timezoneTitle.textContent = t().timezoneTitle;
  el.timezoneApply.textContent = t().timezoneApply;
  el.timezoneClose.setAttribute("aria-label", t().timezoneClose);
  el.authorCredit.textContent = t().author;
  el.visitorLabel.textContent = `${t().visitors}:`;
  el.tabsNav.setAttribute("aria-label", t().tabsLabel);
  el.tabs.forEach((tab) => {
    const tabLabels = {
      matches: t().matches,
      groups: t().groups,
      knockout: t().knockout,
      scorers: t().scorers
    };
    tab.textContent = tabLabels[tab.dataset.tab] || "";
  });
  el.visitorBadge.src = visitorBadgeUrl();
  el.visitorBadge.alt = t().visitors;
  if (!state.loadedAt) setUpdatedAt("");
}

function populateTimeZoneSelect() {
  const zones = availableTimeZones();
  el.timezoneSelect.innerHTML = zones.map((timeZone) => `
    <option value="${escapeHtml(timeZone)}" ${timeZone === state.timeZone ? "selected" : ""}>
      ${escapeHtml(timeZoneOptionLabel(timeZone))}
    </option>
  `).join("");
}

function openTimeZonePanel() {
  populateTimeZoneSelect();
  el.timezonePanel.hidden = false;
  el.timezoneSelect.focus();
}

function closeTimeZonePanel() {
  el.timezonePanel.hidden = true;
}

function applyTimeZone(timeZone) {
  const nextTimeZone = validTimeZone(timeZone) || DEFAULT_TIME_ZONE;
  state.timeZone = nextTimeZone;
  localStorage.setItem(TIME_ZONE_KEY, nextTimeZone);
  closeTimeZonePanel();
  if (state.loadedAt) render();
}

function applyLanguage(lang, shouldRender = true) {
  state.lang = lang === "ar" ? "ar" : "en";
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  document.documentElement.dataset.lang = state.lang;
  if (state.lang === "en") delete document.documentElement.dataset.lang;
  updateStaticText();
  applyTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  if (shouldRender && state.loadedAt) render();
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
    el.themeToggle.textContent = t().themeNight;
  } else {
    delete document.documentElement.dataset.theme;
    el.themeToggle.textContent = t().themeDay;
  }
}

el.langToggle.addEventListener("click", () => {
  const nextLang = state.lang === "ar" ? "en" : "ar";
  localStorage.setItem(LANG_KEY, nextLang);
  applyLanguage(nextLang);
});

el.timezoneToggle.addEventListener("click", openTimeZonePanel);
el.timezoneClose.addEventListener("click", closeTimeZonePanel);
el.timezoneApply.addEventListener("click", () => applyTimeZone(el.timezoneSelect.value));
el.timezonePanel.addEventListener("click", (event) => {
  if (event.target === el.timezonePanel) closeTimeZonePanel();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !el.timezonePanel.hidden) closeTimeZonePanel();
});

el.themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  localStorage.setItem("worldCupTheme", nextTheme);
  applyTheme(nextTheme);
});

el.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.tab = tab.dataset.tab;
    el.tabs.forEach((item) => item.classList.toggle("is-active", item === tab));
    render();
  });
});

el.content.addEventListener("click", (event) => {
  const zoomButton = event.target.closest("[data-knockout-zoom]");
  if (zoomButton) {
    setKnockoutZoom(zoomButton.dataset.knockoutZoom);
    return;
  }

  const trigger = event.target.closest("[data-match-toggle]");
  if (!trigger) return;
  const matchId = trigger.dataset.matchToggle;
  state.expandedMatchId = state.expandedMatchId === matchId ? null : matchId;
  render();
});

el.content.addEventListener("wheel", (event) => {
  const viewport = event.target.closest(".knockout-viewport");
  if (!viewport || !event.ctrlKey) return;
  event.preventDefault();
  setKnockoutZoom(event.deltaY < 0 ? "in" : "out");
}, { passive: false });

function setKnockoutZoom(action) {
  if (action === "reset") {
    state.knockoutZoom = 0.58;
  } else {
    const direction = action === "in" ? 1 : -1;
    state.knockoutZoom = clampZoom(state.knockoutZoom + direction * KNOCKOUT_ZOOM_STEP);
  }
  syncKnockoutZoom();
}

function clampZoom(value) {
  return Math.max(KNOCKOUT_ZOOM_MIN, Math.min(KNOCKOUT_ZOOM_MAX, Math.round(value * 100) / 100));
}

function syncKnockoutZoom() {
  const scale = el.content.querySelector(".knockout-scale");
  if (!scale) return;
  scale.style.setProperty("--knockout-zoom", state.knockoutZoom);
  scale.style.width = `${Math.ceil(KNOCKOUT_BOARD.width * state.knockoutZoom)}px`;
  scale.style.height = `${Math.ceil(KNOCKOUT_BOARD.height * state.knockoutZoom)}px`;
}

applyLanguage(state.lang, false);
applyTheme(localStorage.getItem("worldCupTheme") === "light" ? "light" : "dark");

let refreshPromise = null;

function refreshData(showError = false) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = loadData()
    .catch(() => {
      if (showError || !state.loadedAt) {
        setUpdatedAt("");
        el.content.innerHTML = `<div class="empty">${escapeHtml(t().unavailable)}</div>`;
      }
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

refreshData(true);
setInterval(() => refreshData(), REFRESH_INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshData();
});
window.addEventListener("focus", () => refreshData());
window.addEventListener("pageshow", () => refreshData());
