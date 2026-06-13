const API = {
  games: "https://worldcup26.ir/get/games",
  groups: "https://worldcup26.ir/get/groups",
  teams: "https://worldcup26.ir/get/teams"
};

const FALLBACK_URL = "data/live-fallback.json";
const UAE_TIME_ZONE = "Asia/Dubai";
const API_TIMEOUT_MS = 6000;
const LANG_KEY = "worldCupLangV2";

const labels = {
  en: {
    langToggle: "عربي",
    themeDay: "Day",
    themeNight: "Night",
    matches: "Matches",
    groups: "Groups",
    tabsLabel: "World Cup views",
    loadError: "Could not load live data. Refresh the page.",
    unavailable: "The live API is unavailable right now.",
    done: "FT",
    live: "Live",
    timezone: "UAE",
    pointAbbr: "pts",
    visitors: "visitors",
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
    tabsLabel: "أقسام كأس العالم",
    loadError: "تعذر تحميل البيانات. حدّث الصفحة.",
    unavailable: "البيانات المباشرة غير متاحة الآن.",
    done: "نهاية",
    live: "مباشر",
    timezone: "الإمارات",
    pointAbbr: "نقطه",
    visitors: "الزوار",
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

const state = {
  tab: "matches",
  lang: localStorage.getItem(LANG_KEY) === "en" ? "en" : "ar",
  games: [],
  groups: [],
  teams: [],
  liveGroupStats: new Map(),
  loadedAt: null,
  fallback: false,
  didInitialScroll: false
};

const el = {
  title: document.querySelector("h1"),
  content: document.getElementById("content"),
  updatedAt: document.getElementById("updated-at"),
  visitorLabel: document.getElementById("visitor-label"),
  langToggle: document.getElementById("lang-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  visitorBadge: document.querySelector(".visitor-badge"),
  tabsNav: document.querySelector(".tabs"),
  tabs: [...document.querySelectorAll(".tab")]
};

const dateFormats = {
  en: {
    day: new Intl.DateTimeFormat("en-AE-u-nu-latn", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: UAE_TIME_ZONE
    }),
    time: new Intl.DateTimeFormat("en-AE-u-nu-latn", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: UAE_TIME_ZONE
    }),
    stamp: new Intl.DateTimeFormat("en-AE-u-nu-latn", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: UAE_TIME_ZONE
    })
  },
  ar: {
    day: new Intl.DateTimeFormat("ar-AE-u-nu-latn", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: UAE_TIME_ZONE
    }),
    time: new Intl.DateTimeFormat("ar-AE-u-nu-latn", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: UAE_TIME_ZONE
    }),
    stamp: new Intl.DateTimeFormat("ar-AE-u-nu-latn", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: UAE_TIME_ZONE
    })
  }
};

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function t() {
  return labels[state.lang];
}

function formatDate(kind, date) {
  return dateFormats[state.lang][kind].format(date);
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

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadData() {
  try {
    const [games, groups, teams] = await Promise.all([
      getJson(API.games),
      getJson(API.groups),
      getJson(API.teams)
    ]);
    applyData({
      games: games.games || [],
      groups: groups.groups || [],
      teams: teams.teams || []
    }, false);
  } catch (error) {
    const fallback = await fetch(`${FALLBACK_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!fallback.ok) throw error;
    applyData(await fallback.json(), true);
  }
}

function applyData(data, fallback) {
  state.games = (data.games || []).map(hydrateGame).sort((a, b) => a.date - b.date);
  state.groups = data.groups || [];
  state.teams = data.teams || [];
  state.liveGroupStats = computeLiveGroupStats();
  const fallbackTime = fallback && data.fetchedAt ? new Date(data.fetchedAt) : null;
  state.loadedAt = fallbackTime && !Number.isNaN(fallbackTime.getTime()) ? fallbackTime : new Date();
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

      if (game.homeScore > game.awayScore) {
        home.pts += 3;
      } else if (game.awayScore > game.homeScore) {
        away.pts += 3;
      } else {
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

function matchCard(game, isScrollTarget = false) {
  const status = statusLabel(game);
  const side = isFinished(game) || isLive(game)
    ? `<span class="scoreline">${game.homeScore}-${game.awayScore}</span>`
    : `<span class="time">${formatDate("time", game.date)}</span>`;
  const stateClass = isLive(game) ? "is-live" : isFinished(game) ? "is-done" : "is-pending";

  return `
    <article class="match ${stateClass} ${isScrollTarget ? "is-scroll-target" : ""}">
      <div class="teams">
        ${teamLine(game, "home")}
        ${teamLine(game, "away")}
      </div>
      <div class="match-side">
        ${side}
        <span class="pill ${status.className}">${escapeHtml(status.text)}</span>
      </div>
    </article>
  `;
}

function teamLine(game, side) {
  const team = teamById(teamId(game, side));
  const name = side === "home" ? game.homeName : game.awayName;
  const score = side === "home" ? game.homeScore : game.awayScore;
  const showScore = isFinished(game) || isLive(game);
  const code = teamCode(team, name);
  const label = matchTeamLabel(team, name);
  const detail = game.type === "group" && team
    ? groupProgressText(team.id)
    : knockoutLabelText(name);

  return `
    <div class="team">
      ${team?.flag ? `<img class="flag" src="${escapeHtml(team.flag)}" alt="">` : `<span class="flag placeholder">${escapeHtml(code)}</span>`}
      <span class="team-name"><strong>${escapeHtml(label)}</strong> <span>- ${escapeHtml(detail)}</span></span>
      ${showScore ? `<span class="team-score">${score}</span>` : ""}
    </div>
  `;
}

function groupProgressText(teamIdValue) {
  const stats = state.liveGroupStats.get(String(teamIdValue));
  if (!stats) return `0/3 - 0 ${t().pointAbbr}`;
  const total = stats.total || 3;
  return `${stats.played}/${total} - ${stats.pts} ${t().pointAbbr}`;
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
  if (isLive(game)) return { text: state.lang === "ar" ? t().live : `${game.time_elapsed}`, className: "live" };
  return { text: t().timezone, className: "" };
}

function sortedGroupTeams(teams) {
  return [...teams].sort((a, b) => {
    return numberValue(b.pts) - numberValue(a.pts)
      || numberValue(b.gd) - numberValue(a.gd)
      || numberValue(b.gf) - numberValue(a.gf)
      || (teamById(a.team_id)?.name_en || "").localeCompare(teamById(b.team_id)?.name_en || "");
  });
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
  el.visitorLabel.textContent = `${t().visitors}:`;
  el.tabsNav.setAttribute("aria-label", t().tabsLabel);
  el.tabs.forEach((tab) => {
    tab.textContent = tab.dataset.tab === "matches" ? t().matches : t().groups;
  });
  el.visitorBadge.src = visitorBadgeUrl();
  el.visitorBadge.alt = t().visitors;
  if (!state.loadedAt) setUpdatedAt("");
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

applyLanguage(state.lang, false);
applyTheme(localStorage.getItem("worldCupTheme") === "light" ? "light" : "dark");

loadData().catch(() => {
  setUpdatedAt("");
  el.content.innerHTML = `<div class="empty">${escapeHtml(t().unavailable)}</div>`;
});

setInterval(() => {
  if (!document.hidden) {
    loadData().catch(() => {});
  }
}, 60000);
