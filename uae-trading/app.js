const state = {
  profiles: [],
  portfolio: [],
  performance: null,
  page: "scanner",
  status: null,
  filters: {
    search: "",
    market: "all",
    verdict: "all",
    sort: "score",
  },
};

const els = {
  portfolioOpen: document.getElementById("portfolioOpen"),
  portfolioDialog: document.getElementById("portfolioDialog"),
  portfolioClose: document.getElementById("portfolioClose"),
  portfolioForm: document.getElementById("portfolioForm"),
  positionSymbol: document.getElementById("positionSymbol"),
  positionDate: document.getElementById("positionDate"),
  positionPrice: document.getElementById("positionPrice"),
  positionQuantity: document.getElementById("positionQuantity"),
  positionNotes: document.getElementById("positionNotes"),
  symbolList: document.getElementById("symbolList"),
  portfolioRows: document.getElementById("portfolioRows"),
  portfolioEmpty: document.getElementById("portfolioEmpty"),
  portfolioCount: document.getElementById("portfolioCount"),
  scannerOpen: document.getElementById("scannerOpen"),
  performanceOpen: document.getElementById("performanceOpen"),
  scannerPage: document.getElementById("scannerPage"),
  performancePage: document.getElementById("performancePage"),
  performanceRefresh: document.getElementById("performanceRefresh"),
  perfTotalSignals: document.getElementById("perfTotalSignals"),
  perfOpenSignals: document.getElementById("perfOpenSignals"),
  perfTarget1Rate: document.getElementById("perfTarget1Rate"),
  perfTarget2Rate: document.getElementById("perfTarget2Rate"),
  perfStopRate: document.getElementById("perfStopRate"),
  perfAverageR: document.getElementById("perfAverageR"),
  perfGeneratedAt: document.getElementById("perfGeneratedAt"),
  signalRows: document.getElementById("signalRows"),
  signalsEmpty: document.getElementById("signalsEmpty"),
  setupPerformanceRows: document.getElementById("setupPerformanceRows"),
  tierPerformanceRows: document.getElementById("tierPerformanceRows"),
  stabilityRows: document.getElementById("stabilityRows"),
  stabilityEmpty: document.getElementById("stabilityEmpty"),
  scanNow: document.getElementById("scanNow"),
  lastScan: document.getElementById("lastScan"),
  nextScan: document.getElementById("nextScan"),
  dataDir: document.getElementById("dataDir"),
  source: document.getElementById("source"),
  totalCount: document.getElementById("totalCount"),
  buyCandidateCount: document.getElementById("buyCandidateCount"),
  setupCount: document.getElementById("setupCount"),
  studyCount: document.getElementById("studyCount"),
  watchCount: document.getElementById("watchCount"),
  sellAvoidCount: document.getElementById("sellAvoidCount"),
  search: document.getElementById("search"),
  marketFilter: document.getElementById("marketFilter"),
  verdictFilter: document.getElementById("verdictFilter"),
  sortKey: document.getElementById("sortKey"),
  autoScan: document.getElementById("autoScan"),
  dailyTime: document.getElementById("dailyTime"),
  trendRows: document.getElementById("trendRows"),
  emptyState: document.getElementById("emptyState"),
  toast: document.getElementById("toast"),
};

async function refreshStatus() {
  const response = await fetch("/api/status", { cache: "no-store" });
  const payload = await response.json();
  state.status = payload;
  state.profiles = payload.latest?.profiles || [];
  state.portfolio = payload.portfolio || [];
  state.performance = payload.validation || state.performance;
  render();
}

async function refreshPerformance() {
  const response = await fetch("/api/performance", { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Performance failed");
  }
  state.performance = payload;
  renderPerformance();
}

async function scanNow() {
  setBusy(true);
  try {
    const response = await fetch("/api/scan", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Scan failed");
    }
    state.status = payload;
    state.profiles = payload.latest?.profiles || [];
    state.portfolio = payload.portfolio || [];
    state.performance = payload.validation || state.performance;
    showToast("Data refreshed");
    render();
    if (state.page === "performance") {
      await refreshPerformance();
    }
  } catch (error) {
    showToast(error.message || "Scan failed");
  } finally {
    setBusy(false);
  }
}

async function saveSettings() {
  try {
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auto_scan: els.autoScan.checked,
        daily_time: els.dailyTime.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Settings failed");
    }
    state.status = payload;
    state.profiles = payload.latest?.profiles || [];
    state.portfolio = payload.portfolio || [];
    state.performance = payload.validation || state.performance;
    showToast("Settings saved");
    render();
  } catch (error) {
    showToast(error.message || "Settings failed");
  }
}

function render() {
  const status = state.status || {};
  const latest = status.latest || {};
  const summary = latest.summary || {};

  els.lastScan.textContent = `Last scan: ${formatDateTime(latest.scanned_at)}`;
  els.nextScan.textContent = `Next daily scan: ${formatDateTime(status.next_daily_scan)}`;
  els.dataDir.textContent = `Data: ${status.data_dir || "unknown"}`;
  els.source.textContent = `Source: ${status.source || "local"}`;
  els.autoScan.checked = Boolean(status.auto_scan);
  els.dailyTime.value = status.daily_time || "08:00";

  els.totalCount.textContent = summary.total || 0;
  els.buyCandidateCount.textContent = summary["buy candidate"] || 0;
  els.setupCount.textContent = summary["setup forming"] || 0;
  els.studyCount.textContent = summary["worth studying"] || 0;
  els.watchCount.textContent = summary.watch || 0;
  els.sellAvoidCount.textContent =
    (summary["sell pressure"] || 0) + (summary.avoid || 0) + (summary.ignore || 0);

  if (status.last_error) {
    showToast(status.last_error);
  }

  const rows = filteredProfiles();
  els.trendRows.replaceChildren(...rows.map(renderRow));
  els.emptyState.hidden = rows.length > 0;
  renderSymbolList();
  renderPortfolio();
  renderPage();
  renderPerformance();
  setBusy(Boolean(status.is_scanning));
}

function filteredProfiles() {
  const query = state.filters.search.trim().toUpperCase();
  const filtered = state.profiles.filter((profile) => {
    const market = profile.symbol.split(":")[0];
    const consideration = profile.consideration || {};
    const matchesSearch = !query || profile.symbol.toUpperCase().includes(query);
    const matchesMarket = state.filters.market === "all" || market === state.filters.market;
    const matchesVerdict =
      state.filters.verdict === "all" || consideration.verdict === state.filters.verdict;
    return matchesSearch && matchesMarket && matchesVerdict;
  });

  return filtered.sort((a, b) => {
    const aConsideration = a.consideration || {};
    const bConsideration = b.consideration || {};
    if (state.filters.sort === "score") {
      return (bConsideration.score || 0) - (aConsideration.score || 0);
    }
    const key = `${state.filters.sort}_score`;
    return (bConsideration[key] || 0) - (aConsideration[key] || 0);
  });
}

function renderRow(profile) {
  const row = document.createElement("tr");
  const consideration = profile.consideration || {};
  const decision = profile.decision || {};
  row.append(
    cell(symbolMarkup(profile.symbol, profile.last_close)),
    cell(formatNumber(profile.last_close, 3)),
    cell(verdictMarkup(consideration)),
    cell(decisionMarkup(decision)),
    cell(setupMarkup(decision)),
    cell(tierMarkup(decision.liquidity_tier || consideration.liquidity_tier)),
    cell(rangeMarkup(decision.suggested_buy_low, decision.suggested_buy_high)),
    cell(priceMarkup(decision.stop_loss)),
    cell(priceMarkup(decision.trailing_stop)),
    cell(targetsMarkup(decision)),
    cell(formatNumber(decision.risk_reward, 2)),
    cell(positionMarkup(decision)),
    cell(scoreMarkup(consideration.score)),
    cell(scoreMarkup(consideration.liquidity_score)),
    cell(scoreMarkup(consideration.trend_score)),
    cell(scoreMarkup(consideration.momentum_score)),
    cell(scoreMarkup(consideration.volume_score)),
    cell(scoreMarkup(consideration.risk_score)),
    cell(windowMarkup(profile.windows["1m"])),
    cell(windowMarkup(profile.windows["6m"])),
    cell(windowMarkup(profile.windows["1y"]))
  );
  return row;
}

function renderSymbolList() {
  const options = state.profiles.map((profile) => {
    const option = document.createElement("option");
    option.value = profile.symbol;
    return option;
  });
  els.symbolList.replaceChildren(...options);
}

function renderPortfolio() {
  const rows = state.portfolio.map((position) => {
    const row = document.createElement("tr");
    row.append(
      cell(position.symbol),
      cell(position.buy_date),
      cell(formatNumber(position.buy_price, 3)),
      cell(formatQuantity(position.quantity)),
      cell(position.notes || "-"),
      cell(deleteButton(position.id))
    );
    return row;
  });
  els.portfolioRows.replaceChildren(...rows);
  els.portfolioEmpty.hidden = rows.length > 0;
  els.portfolioCount.textContent = `${rows.length} ${rows.length === 1 ? "position" : "positions"}`;
}

function renderPage() {
  const performance = state.page === "performance";
  els.scannerPage.hidden = performance;
  els.performancePage.hidden = !performance;
  els.scannerOpen.classList.toggle("active", !performance);
  els.performanceOpen.classList.toggle("active", performance);
}

function renderPerformance() {
  const report = state.performance || {};
  const summary = report.summary || {};
  els.perfTotalSignals.textContent = summary.total_signals || 0;
  els.perfOpenSignals.textContent = summary.open_signals || 0;
  els.perfTarget1Rate.textContent = formatPercent(summary.target1_hit_rate);
  els.perfTarget2Rate.textContent = formatPercent(summary.target2_hit_rate);
  els.perfStopRate.textContent = formatPercent(summary.stop_rate);
  els.perfAverageR.textContent = formatR(summary.average_r);
  els.perfGeneratedAt.textContent = report.generated_at ? `Updated ${formatDateTime(report.generated_at)}` : "Waiting";

  const signalRows = (report.recent_signals || []).map(renderSignalRow);
  els.signalRows.replaceChildren(...signalRows);
  els.signalsEmpty.hidden = signalRows.length > 0;

  els.setupPerformanceRows.replaceChildren(...(report.by_setup || []).map(renderGroupPerformanceRow));
  els.tierPerformanceRows.replaceChildren(...(report.by_tier || []).map(renderGroupPerformanceRow));

  const stabilityRows = (report.stability || []).map(renderStabilityRow);
  els.stabilityRows.replaceChildren(...stabilityRows);
  els.stabilityEmpty.hidden = stabilityRows.length > 0;
}

function renderSignalRow(signal) {
  const row = document.createElement("tr");
  row.append(
    cell(signal.symbol || "-"),
    cell(statusStack(signal.status || "unknown", signal.outcome || "")),
    cell(setupTierStack(signal.setup_type, signal.liquidity_tier)),
    cell(dateStack(signal.opened_date, signal.as_of_date ? `data ${signal.as_of_date}` : "")),
    cell(dateStack(signal.entry_date, signal.entry_price ? formatNumber(signal.entry_price, 3) : "")),
    cell(dateStack(signal.closed_date, signal.close_price ? formatNumber(signal.close_price, 3) : "")),
    cell(formatR(signal.r_multiple)),
    cell(stabilityMarkup(signal.stability_score, signal.observation_count))
  );
  return row;
}

function renderGroupPerformanceRow(group) {
  const row = document.createElement("tr");
  row.append(
    cell(group.name || "-"),
    cell(group.total || 0),
    cell(formatPercent(group.target2_hit_rate)),
    cell(formatR(group.average_r))
  );
  return row;
}

function renderStabilityRow(item) {
  const row = document.createElement("tr");
  const changes = `${item.action_changes || 0}/${item.verdict_changes || 0}/${item.setup_changes || 0}`;
  row.append(
    cell(item.symbol || "-"),
    cell(badge(item.confidence || "unknown")),
    cell(`${item.stable_streak || 0} of ${item.days_tracked || 0}`),
    cell(changes),
    cell(badge(item.last_verdict || "unknown")),
    cell(badge(item.last_action || "unknown")),
    cell(badge(item.last_setup || "unknown")),
    cell(scoreMarkup(item.stability_score))
  );
  return row;
}

function statusStack(status, detail) {
  const wrapper = document.createElement("div");
  wrapper.className = "status-stack";
  wrapper.append(badge(status || "unknown"));
  if (detail) {
    const note = document.createElement("div");
    note.className = "mini-stat";
    note.textContent = detail;
    wrapper.append(note);
  }
  return wrapper;
}

function setupTierStack(setup, tier) {
  const wrapper = document.createElement("div");
  wrapper.className = "status-stack";
  wrapper.append(badge(setup || "unqualified"));
  const note = document.createElement("div");
  note.className = "mini-stat";
  note.textContent = tier ? `Tier ${tier}` : "Tier -";
  wrapper.append(note);
  return wrapper;
}

function dateStack(date, detail) {
  const wrapper = document.createElement("div");
  wrapper.className = "status-stack";
  const main = document.createElement("div");
  main.textContent = date || "-";
  wrapper.append(main);
  if (detail) {
    const note = document.createElement("div");
    note.className = "mini-stat";
    note.textContent = detail;
    wrapper.append(note);
  }
  return wrapper;
}

function stabilityMarkup(score, count) {
  const wrapper = document.createElement("div");
  wrapper.className = "status-stack";
  wrapper.append(scoreMarkup(score));
  const note = document.createElement("div");
  note.className = "mini-stat";
  note.textContent = `${count || 0} observations`;
  wrapper.append(note);
  return wrapper;
}

function symbolMarkup(symbol, price) {
  const wrapper = document.createElement("div");
  wrapper.className = "symbol-cell";
  const symbolLine = document.createElement("div");
  symbolLine.className = "symbol-line";
  const strong = document.createElement("div");
  strong.className = "symbol";
  strong.textContent = symbol;
  const priceChip = document.createElement("span");
  priceChip.className = "price-chip";
  priceChip.textContent = formatNumber(price, 3);
  symbolLine.append(strong, priceChip);
  const market = document.createElement("div");
  market.className = "muted";
  market.textContent = symbol.split(":")[0] || "";
  wrapper.append(symbolLine, market);
  return wrapper;
}

function verdictMarkup(consideration) {
  const wrapper = document.createElement("div");
  wrapper.className = "verdict-cell";
  wrapper.append(badge(consideration.verdict || "unknown"));
  const detail = document.createElement("div");
  detail.className = "muted reason";
  const text =
    (consideration.vetoes && consideration.vetoes[0]) ||
    (consideration.warnings && consideration.warnings[0]) ||
    (consideration.reasons && consideration.reasons[0]) ||
    "";
  detail.textContent = text;
  wrapper.title = [
    ...(consideration.reasons || []),
    ...(consideration.warnings || []),
    ...(consideration.vetoes || []),
  ].join("\n");
  wrapper.append(detail);
  return wrapper;
}

function decisionMarkup(decision) {
  const wrapper = document.createElement("div");
  wrapper.className = "decision-cell";
  wrapper.append(badge(decision.action || "skip"));
  const detail = document.createElement("div");
  detail.className = "muted reason";
  const text = (decision.warnings && decision.warnings[0]) || (decision.reasons && decision.reasons[0]) || "";
  detail.textContent = text;
  wrapper.title = [...(decision.reasons || []), ...(decision.warnings || [])].join("\n");
  wrapper.append(detail);
  return wrapper;
}

function setupMarkup(decision) {
  const wrapper = document.createElement("div");
  wrapper.className = "decision-cell";
  wrapper.append(badge(decision.setup_type || "unqualified"));
  const detail = document.createElement("div");
  detail.className = "muted reason";
  detail.textContent = decision.stop_basis || "";
  wrapper.append(detail);
  return wrapper;
}

function tierMarkup(tier) {
  const wrapper = document.createElement("div");
  wrapper.className = "tier-cell";
  wrapper.append(badge(tier ? `Tier ${tier}` : "Tier C"));
  return wrapper;
}

function rangeMarkup(low, high) {
  const wrapper = document.createElement("div");
  wrapper.className = "price-stack";
  wrapper.append(priceMarkup(low), priceMarkup(high));
  return wrapper;
}

function targetsMarkup(decision) {
  const wrapper = document.createElement("div");
  wrapper.className = "price-stack";
  wrapper.append(priceMarkup(decision.target1), priceMarkup(decision.target2));
  return wrapper;
}

function positionMarkup(decision) {
  const wrapper = document.createElement("div");
  wrapper.className = "position-cell";
  if (!decision.already_bought) {
    wrapper.textContent = "-";
    return wrapper;
  }
  const buy = document.createElement("div");
  buy.textContent = `${decision.buy_date || ""} @ ${formatNumber(decision.buy_price, 3)}`;
  const pl = document.createElement("div");
  pl.className = `return ${decision.unrealized_pl_pct >= 0 ? "positive" : "negative"}`;
  pl.textContent = `${formatSigned(decision.unrealized_pl_pct, 2)}%`;
  wrapper.append(buy, pl);
  return wrapper;
}

function priceMarkup(value) {
  const item = document.createElement("span");
  item.className = "plain-price";
  item.textContent = formatNumber(value, 3);
  return item;
}

function scoreMarkup(value) {
  const wrapper = document.createElement("div");
  wrapper.className = "overall";
  const line = document.createElement("div");
  line.className = "window-main";
  line.append(strongText(formatNumber(value, 1)));

  const bar = document.createElement("div");
  bar.className = "score-bar";
  const fill = document.createElement("div");
  fill.className = `score-fill ${scoreClass(value)}`;
  fill.style.width = `${Math.min(Math.max(Number(value) || 0, 0), 100)}%`;
  bar.append(fill);
  wrapper.append(line, bar);
  return wrapper;
}

function windowMarkup(window) {
  const wrapper = document.createElement("div");
  wrapper.className = "window-cell";
  if (!window) {
    wrapper.textContent = "-";
    return wrapper;
  }
  const main = document.createElement("div");
  main.className = "window-main";
  main.append(badge(window.direction), returnText(window.return_pct));

  const strength = document.createElement("div");
  strength.className = "muted";
  strength.textContent =
    window.direction === "unknown"
      ? `${window.bars} bars`
      : `${formatNumber(window.strength, 0)} strength`;

  const rate = document.createElement("div");
  rate.className = "muted";
  rate.textContent =
    window.daily_rate_pct === null || window.daily_rate_pct === undefined
      ? "rate unavailable"
      : `${formatSigned(window.daily_rate_pct, 3)}%/day`;

  wrapper.title = window.note || "";
  wrapper.append(main, strength, rate);
  return wrapper;
}

function badge(value) {
  const item = document.createElement("span");
  item.className = `badge ${badgeClass(value)}`;
  item.textContent = labelText(value || "unknown");
  return item;
}

function badgeClass(value) {
  if (value === "buy candidate" || value === "setup forming" || value === "bullish" || value === "buy" || value === "hold" || value === "trend pullback" || value === "breakout" || value === "Tier A" || value === "target1_hit" || value === "target2" || value === "more confident") {
    return "bullish";
  }
  if (value === "worth studying" || value === "watch" || value === "sideways" || value === "mean reversion" || value === "Tier B" || value === "waiting_entry" || value === "active" || value === "expired" || value === "steady") {
    return "sideways";
  }
  if (value === "sell pressure" || value === "avoid" || value === "ignore" || value === "bearish" || value === "sell" || value === "skip" || value === "exit weakness" || value === "unqualified" || value === "Tier C" || value === "stopped" || value === "invalidated" || value === "choppy") {
    return "bearish";
  }
  return "unknown";
}

function labelText(value) {
  return String(value || "unknown").replace(/_/g, " ");
}

function deleteButton(positionId) {
  const button = document.createElement("button");
  button.className = "danger-button";
  button.type = "button";
  button.textContent = "Remove";
  button.addEventListener("click", () => deletePosition(positionId));
  return button;
}

function scoreClass(value) {
  const score = Number(value) || 0;
  if (score >= 70) {
    return "bullish";
  }
  if (score >= 50) {
    return "sideways";
  }
  return "bearish";
}

function cell(content) {
  const item = document.createElement("td");
  if (content instanceof Node) {
    item.append(content);
  } else {
    item.textContent = content;
  }
  return item;
}

function strongText(value) {
  const item = document.createElement("strong");
  item.textContent = value;
  return item;
}

function returnText(value) {
  const item = document.createElement("span");
  item.className = `return ${value > 0 ? "positive" : value < 0 ? "negative" : ""}`;
  item.textContent = value === null || value === undefined ? "-" : `${formatSigned(value, 1)}%`;
  return item;
}

function formatNumber(value, digits) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(digits);
}

function formatSigned(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(0)}%`;
}

function formatR(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(2)}R`;
}

function formatQuantity(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toLocaleString([], { maximumFractionDigits: 3 });
}

function formatDateTime(value) {
  if (!value) {
    return "waiting";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setBusy(isBusy) {
  els.scanNow.disabled = isBusy;
  els.scanNow.textContent = isBusy ? "Refreshing" : "Refresh data";
}

async function addPosition(event) {
  event.preventDefault();
  setBusy(true);
  try {
    const response = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: els.positionSymbol.value,
        buy_date: els.positionDate.value,
        buy_price: Number(els.positionPrice.value),
        quantity: Number(els.positionQuantity.value),
        notes: els.positionNotes.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not add position");
    }
    state.status = payload;
    state.profiles = payload.latest?.profiles || [];
    state.portfolio = payload.portfolio || [];
    state.performance = payload.validation || state.performance;
    els.portfolioForm.reset();
    setDefaultBuyDate();
    showToast("Position added");
    render();
  } catch (error) {
    showToast(error.message || "Could not add position");
  } finally {
    setBusy(false);
  }
}

async function deletePosition(positionId) {
  setBusy(true);
  try {
    const response = await fetch(`/api/portfolio?id=${encodeURIComponent(positionId)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not remove position");
    }
    state.status = payload;
    state.profiles = payload.latest?.profiles || [];
    state.portfolio = payload.portfolio || [];
    state.performance = payload.validation || state.performance;
    showToast("Position removed");
    render();
  } catch (error) {
    showToast(error.message || "Could not remove position");
  } finally {
    setBusy(false);
  }
}

function setDefaultBuyDate() {
  els.positionDate.value = new Date().toISOString().slice(0, 10);
}

function showToast(message) {
  if (!message) {
    return;
  }
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    els.toast.hidden = true;
  }, 3200);
}

els.scanNow.addEventListener("click", scanNow);
els.scannerOpen.addEventListener("click", () => {
  state.page = "scanner";
  renderPage();
});
els.performanceOpen.addEventListener("click", () => {
  state.page = "performance";
  renderPage();
  refreshPerformance().catch((error) => showToast(error.message || "Performance failed"));
});
els.performanceRefresh.addEventListener("click", () => {
  refreshPerformance().catch((error) => showToast(error.message || "Performance failed"));
});
els.portfolioOpen.addEventListener("click", () => {
  setDefaultBuyDate();
  els.portfolioDialog.showModal();
});
els.portfolioClose.addEventListener("click", () => els.portfolioDialog.close());
els.portfolioForm.addEventListener("submit", addPosition);
els.portfolioForm.querySelector("button[type='submit']").addEventListener("click", addPosition);
els.search.addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  render();
});
els.marketFilter.addEventListener("change", (event) => {
  state.filters.market = event.target.value;
  render();
});
els.verdictFilter.addEventListener("change", (event) => {
  state.filters.verdict = event.target.value;
  render();
});
els.sortKey.addEventListener("change", (event) => {
  state.filters.sort = event.target.value;
  render();
});
els.autoScan.addEventListener("change", saveSettings);
els.dailyTime.addEventListener("change", saveSettings);

refreshStatus().catch((error) => showToast(error.message || "Failed to load"));
setInterval(() => {
  refreshStatus().catch(() => undefined);
}, 30000);
