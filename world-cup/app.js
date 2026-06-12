const API_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const FALLBACK_URL = "data/matches-fallback.json";
const UAE_TIME_ZONE = "Asia/Dubai";
const SOURCE_LABEL = "openfootball/worldcup.json public JSON";

const state = {
  filter: "all",
  query: "",
  matches: [],
  loadedAt: null,
  source: "Loading"
};

const elements = {
  matchCount: document.getElementById("match-count"),
  sourceLine: document.getElementById("source-line"),
  dayList: document.getElementById("day-list"),
  search: document.getElementById("search"),
  refresh: document.getElementById("refresh-button"),
  chips: [...document.querySelectorAll(".chip")]
};

const uaeDateFormatter = new Intl.DateTimeFormat("en-AE", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: UAE_TIME_ZONE
});

const uaeLongDateFormatter = new Intl.DateTimeFormat("en-AE", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: UAE_TIME_ZONE
});

const uaeTimeFormatter = new Intl.DateTimeFormat("en-AE", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: UAE_TIME_ZONE
});

const fullDateFormatter = new Intl.DateTimeFormat("en-AE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: UAE_TIME_ZONE
});

function parseMatchDate(match) {
  const time = match.time || "00:00 UTC+0";
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?:\s+UTC([+-]\d{1,2}))?$/);
  if (!timeMatch) return new Date(`${match.date}T00:00:00Z`);

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const offset = Number(timeMatch[3] || "0");
  const utcHour = hour - offset;
  return new Date(Date.UTC(...match.date.split("-").map((part, index) => index === 1 ? Number(part) - 1 : Number(part)), utcHour, minute));
}

function normalizeMatch(match, index) {
  const date = parseMatchDate(match);
  return {
    ...match,
    id: `${match.date}-${match.time}-${match.team1}-${match.team2}-${index}`,
    index,
    dateObject: date,
    uaeDayKey: dateKey(date),
    uaeDayLabel: uaeLongDateFormatter.format(date),
    uaeShortDay: uaeDateFormatter.format(date),
    uaeTime: uaeTimeFormatter.format(date),
    searchable: `${match.team1} ${match.team2} ${match.group || ""} ${match.round || ""} ${match.ground || ""}`.toLowerCase()
  };
}

function dateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: UAE_TIME_ZONE
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function nowInUaeKey() {
  return dateKey(new Date());
}

function isGroupMatch(match) {
  return Boolean(match.group) || /^Matchday/i.test(match.round || "");
}

function isKnockoutMatch(match) {
  return !isGroupMatch(match);
}

async function fetchSchedule(force = false) {
  elements.refresh.disabled = true;
  elements.sourceLine.textContent = force ? "Refreshing schedule" : "Fetching public schedule API";

  try {
    const response = await fetch(`${API_URL}${force ? `?t=${Date.now()}` : ""}`, { cache: force ? "reload" : "default" });
    if (!response.ok) throw new Error(`API status ${response.status}`);
    const data = await response.json();
    applySchedule(data, SOURCE_LABEL);
  } catch (error) {
    try {
      const fallback = await fetch(`${FALLBACK_URL}?t=local`, { cache: "no-store" });
      if (!fallback.ok) throw new Error(`fallback status ${fallback.status}`);
      const data = await fallback.json();
      applySchedule(data, "local fallback copy");
    } catch (fallbackError) {
      elements.sourceLine.textContent = "Could not load the schedule. Check your connection and tap Refresh.";
      elements.dayList.innerHTML = emptyState("Schedule unavailable", "The public API and the local fallback could not be loaded.");
    }
  } finally {
    elements.refresh.disabled = false;
  }
}

function applySchedule(data, source) {
  state.matches = (data.matches || [])
    .map(normalizeMatch)
    .sort((a, b) => a.dateObject - b.dateObject);
  state.loadedAt = new Date();
  state.source = source;
  render();
}

function render() {
  const filtered = getFilteredMatches();
  elements.matchCount.textContent = `${state.matches.length} matches`;
  elements.sourceLine.textContent = `${state.source} - updated ${fullDateFormatter.format(state.loadedAt)}`;

  if (!filtered.length) {
    elements.dayList.innerHTML = emptyState("No matches found", "Try another team, city, group, or filter.");
    return;
  }

  const groups = groupByDay(filtered);
  elements.dayList.innerHTML = Object.entries(groups).map(([dayKey, matches]) => `
    <section class="day-group">
      <header class="day-heading">
        <h2>${matches[0].uaeDayLabel}</h2>
        <span>${matches.length} match${matches.length === 1 ? "" : "es"}</span>
      </header>
      ${matches.map(matchCard).join("")}
    </section>
  `).join("");
}

function getFilteredMatches() {
  const query = state.query.trim().toLowerCase();
  const today = nowInUaeKey();
  const now = Date.now();

  return state.matches.filter((match) => {
    if (query && !match.searchable.includes(query)) return false;
    if (state.filter === "today") return match.uaeDayKey === today;
    if (state.filter === "upcoming") return match.dateObject.getTime() >= now - 3 * 60 * 60 * 1000;
    if (state.filter === "groups") return isGroupMatch(match);
    if (state.filter === "knockout") return isKnockoutMatch(match);
    return true;
  });
}

function groupByDay(matches) {
  return matches.reduce((days, match) => {
    days[match.uaeDayKey] ||= [];
    days[match.uaeDayKey].push(match);
    return days;
  }, {});
}

function matchCard(match) {
  const round = match.group || match.round || "World Cup";
  const venue = match.ground || "Venue TBA";
  const hostTime = match.time ? match.time.replace("UTC", "UTC ") : "Host time TBA";

  return `
    <article class="match-card">
      <div class="match-top">
        <div class="time-block">
          <span class="time">${match.uaeTime}</span>
          <span class="timezone">UAE</span>
        </div>
        <span class="badge">${round}</span>
      </div>

      <div class="teams">
        ${teamRow(match.team1)}
        <div class="versus">VS</div>
        ${teamRow(match.team2)}
      </div>

      <div class="match-meta">
        <span><strong>${venue}</strong></span>
        <span>${match.round || "Match"} - host local time ${hostTime}</span>
      </div>
    </article>
  `;
}

function teamRow(name) {
  return `
    <div class="team-row">
      <span class="team-mark">${teamInitials(name)}</span>
      <span class="team-name">${name || "TBA"}</span>
    </div>
  `;
}

function teamInitials(name = "TBA") {
  return name
    .replace(/\([^)]*\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "TBA";
}

function emptyState(title, text) {
  return `
    <section class="empty-state">
      <h2>${title}</h2>
      <p>${text}</p>
    </section>
  `;
}

elements.search.addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

elements.refresh.addEventListener("click", () => fetchSchedule(true));

elements.chips.forEach((chip) => {
  chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    elements.chips.forEach((item) => item.classList.toggle("is-active", item === chip));
    render();
  });
});

fetchSchedule();
