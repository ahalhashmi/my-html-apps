const API = {
  games: "https://worldcup26.ir/get/games",
  groups: "https://worldcup26.ir/get/groups",
  teams: "https://worldcup26.ir/get/teams"
};

const FALLBACK_URL = "data/live-fallback.json";
const UAE_TIME_ZONE = "Asia/Dubai";

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
  games: [],
  groups: [],
  teams: [],
  liveGroupStats: new Map(),
  loadedAt: null,
  fallback: false,
  didInitialScroll: false
};

const el = {
  content: document.getElementById("content"),
  status: document.getElementById("status"),
  refresh: document.getElementById("refresh"),
  themeToggle: document.getElementById("theme-toggle"),
  tabs: [...document.querySelectorAll(".tab")]
};

const dayFormat = new Intl.DateTimeFormat("en-AE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: UAE_TIME_ZONE
});

const timeFormat = new Intl.DateTimeFormat("en-AE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: UAE_TIME_ZONE
});

const stampFormat = new Intl.DateTimeFormat("en-AE", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: UAE_TIME_ZONE
});

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function loadData() {
  el.refresh.disabled = true;
  setStatus("Refreshing live data...");

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
    const fallback = await fetch(FALLBACK_URL, { cache: "no-store" });
    if (!fallback.ok) throw error;
    applyData(await fallback.json(), true);
  } finally {
    el.refresh.disabled = false;
  }
}

function applyData(data, fallback) {
  state.games = (data.games || []).map(hydrateGame).sort((a, b) => a.date - b.date);
  state.groups = data.groups || [];
  state.teams = data.teams || [];
  state.liveGroupStats = computeLiveGroupStats();
  state.loadedAt = new Date();
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

function setStatus(text) {
  el.status.textContent = text;
}

function render() {
  setStatus(`Last updated ${stampFormat.format(state.loadedAt)} UAE - ${state.games.length} matches - refreshes every 60s`);

  if (state.tab === "matches") renderMatches();
  if (state.tab === "groups") renderGroups();
}

function renderMatches() {
  const lastFinished = [...state.games].reverse().find(isFinished);
  const days = groupBy(state.games, (game) => dayFormat.format(game.date));
  el.content.innerHTML = Object.entries(days).map(([day, games]) => `
    <section class="day">
      <h2 class="day-title">${day}</h2>
      ${games.map((game) => matchCard(game, lastFinished?.id === game.id)).join("")}
    </section>
  `).join("");

  if (!state.didInitialScroll && lastFinished) {
    state.didInitialScroll = true;
    requestAnimationFrame(() => {
      const target = document.querySelector(".match.is-scroll-target");
      if (!target) return;
      const offset = document.querySelector(".tabs")?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - offset - 8;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  }
}

function renderGroups() {
  const groups = [...state.groups].sort((a, b) => a.name.localeCompare(b.name));
  el.content.innerHTML = groups.map((group) => `
    <section class="group-card">
      <h2 class="group-title">Group ${group.name}</h2>
      <table class="standing">
        <thead>
          <tr>
            <th>Team</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GD</th>
            <th>Pts</th>
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
    : `<span class="time">${timeFormat.format(game.date)}</span>`;
  const stateClass = isLive(game) ? "is-live" : isFinished(game) ? "is-done" : "is-pending";

  return `
    <article class="match ${stateClass} ${isScrollTarget ? "is-scroll-target" : ""}">
      <div class="teams">
        ${teamLine(game, "home")}
        ${teamLine(game, "away")}
      </div>
      <div class="match-side">
        ${side}
        <span class="pill ${status.className}">${status.text}</span>
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
  const detail = game.type === "group" && team
    ? groupProgressText(team.id)
    : knockoutLabelText(name);

  return `
    <div class="team">
      ${team?.flag ? `<img class="flag" src="${team.flag}" alt="">` : `<span class="flag placeholder">${code}</span>`}
      <span class="team-name"><strong>${code}</strong> <span>- ${detail}</span></span>
      ${showScore ? `<span class="team-score">${score}</span>` : ""}
    </div>
  `;
}

function groupProgressText(teamIdValue) {
  const stats = state.liveGroupStats.get(String(teamIdValue));
  if (!stats) return "0/3 - 0 pts";
  const total = stats.total || 3;
  return `${stats.played}/${total} - ${stats.pts} pts`;
}

function knockoutLabelText(name) {
  const text = String(name || "");
  if (/^(Winner|Loser) Match/i.test(text)) return text.replace("Match", "M");
  if (/^Winner Group/i.test(text)) return text.replace("Winner Group", "1st Group");
  if (/^Runner-up Group/i.test(text)) return text.replace("Runner-up Group", "2nd Group");
  return text;
}

function statusLabel(game) {
  if (isFinished(game)) return { text: "FT", className: "done" };
  if (isLive(game)) return { text: `${game.time_elapsed}`, className: "live" };
  return { text: "UAE", className: "" };
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
  const name = team?.name_en || `Team ${row.team_id}`;
  return `
    <tr>
      <td>
        <div class="team-cell">
          ${team?.flag ? `<img class="flag" src="${team.flag}" alt="">` : `<span class="flag placeholder">${initials(name)}</span>`}
          <span>${name}</span>
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

el.refresh.addEventListener("click", loadData);

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.dataset.theme = "light";
    el.themeToggle.textContent = "Night";
  } else {
    delete document.documentElement.dataset.theme;
    el.themeToggle.textContent = "Day";
  }
}

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

applyTheme(localStorage.getItem("worldCupTheme") === "light" ? "light" : "dark");

loadData().catch(() => {
  setStatus("Could not load live data. Try Refresh.");
  el.content.innerHTML = `<div class="empty">The live API is unavailable right now.</div>`;
});

setInterval(() => {
  if (!document.hidden) loadData();
}, 60000);
