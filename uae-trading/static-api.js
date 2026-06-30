(() => {
  const DATA_URL = "data/latest.json";
  const PORTFOLIO_KEY = "uaeTradingPortfolioV1";
  const SCAN_COUNT_KEY = "uaeTradingRefreshCountV1";
  const originalFetch = window.fetch.bind(window);
  let latestPromise = null;
  let latestSnapshot = null;

  window.fetch = async (input, init = {}) => {
    const request = normalizeRequest(input, init);
    if (!request.path.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    try {
      if (request.path === "/api/status" && request.method === "GET") {
        return jsonResponse(await buildStatus());
      }
      if (request.path === "/api/scan" && request.method === "POST") {
        incrementRefreshCount();
        return jsonResponse(await buildStatus({ force: true, trigger: "manual" }));
      }
      if (request.path === "/api/settings" && request.method === "POST") {
        return jsonResponse(await buildStatus());
      }
      if (request.path === "/api/portfolio" && request.method === "GET") {
        return jsonResponse({ positions: getPortfolio() });
      }
      if (request.path === "/api/portfolio" && request.method === "POST") {
        addPosition(JSON.parse(request.body || "{}"));
        return jsonResponse(await buildStatus({ trigger: "portfolio" }));
      }
      if (request.path === "/api/portfolio" && request.method === "DELETE") {
        const id = request.searchParams.get("id") || "";
        if (!deletePosition(id)) {
          return jsonResponse({ error: "position not found" }, 404);
        }
        return jsonResponse(await buildStatus({ trigger: "portfolio" }));
      }
      if (request.path === "/api/export.csv" && request.method === "GET") {
        const status = await buildStatus();
        return new Response(toCsv(status.latest.profiles), {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
          },
        });
      }
    } catch (error) {
      return jsonResponse({ error: error.message || "Static API error" }, 400);
    }

    return jsonResponse({ error: "not found" }, 404);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const exportLink = document.getElementById("exportCsv");
    if (!exportLink) {
      return;
    }
    exportLink.addEventListener("click", async (event) => {
      event.preventDefault();
      const response = await window.fetch("/api/export.csv");
      const csv = await response.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "uae-trading-latest.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  });

  function normalizeRequest(input, init) {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, window.location.origin);
    return {
      method: String(init.method || (typeof input === "string" ? "GET" : input.method) || "GET").toUpperCase(),
      path: parsed.pathname,
      searchParams: parsed.searchParams,
      body: init.body || "",
    };
  }

  async function buildStatus(options = {}) {
    const latest = await loadLatest(Boolean(options.force));
    const profiles = withPortfolioDecisions(latest.profiles || []);
    return {
      data_dir: DATA_URL,
      market: latest.market || "all",
      auto_scan: true,
      source: "GitHub Pages snapshot",
      daily_time: "08:05",
      timezone: "Asia/Dubai",
      is_scanning: false,
      scan_started_at: null,
      scan_count: Number(localStorage.getItem(SCAN_COUNT_KEY) || 0),
      last_error: null,
      last_data_update: latest.last_data_update || null,
      next_daily_scan: nextDubaiDailyScan(),
      latest: {
        ...latest,
        trigger: options.trigger || latest.trigger || "static",
        profiles,
        summary: latest.summary || summarize(profiles),
      },
      portfolio: getPortfolio(),
      csv_available: true,
    };
  }

  async function loadLatest(force = false) {
    if (!latestPromise || force) {
      const separator = DATA_URL.includes("?") ? "&" : "?";
      const url = force ? `${DATA_URL}${separator}t=${Date.now()}` : DATA_URL;
      latestPromise = originalFetch(url, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Could not load ${DATA_URL}`);
          }
          return response.json();
        })
        .then((payload) => {
          latestSnapshot = payload;
          return payload;
        });
    }
    if (latestSnapshot && !force) {
      return latestSnapshot;
    }
    return latestPromise;
  }

  function getPortfolio() {
    try {
      const payload = JSON.parse(localStorage.getItem(PORTFOLIO_KEY) || "[]");
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      return [];
    }
  }

  function savePortfolio(positions) {
    localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(positions));
  }

  function addPosition(payload) {
    const symbol = String(payload.symbol || "").trim().toUpperCase();
    const buyDate = String(payload.buy_date || "").trim();
    const buyPrice = Number(payload.buy_price);
    const quantity = Number(payload.quantity);
    const notes = String(payload.notes || "").trim();
    if (!symbol.includes(":")) {
      throw new Error("symbol must include market prefix, for example DFM:EMAAR");
    }
    if (!buyDate || Number.isNaN(Date.parse(`${buyDate}T00:00:00Z`))) {
      throw new Error("buy date is invalid");
    }
    if (!Number.isFinite(buyPrice) || buyPrice <= 0) {
      throw new Error("buy price must be positive");
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("quantity must be positive");
    }
    const positions = getPortfolio();
    positions.push({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      symbol,
      buy_date: buyDate,
      buy_price: buyPrice,
      quantity,
      notes,
    });
    savePortfolio(positions);
  }

  function deletePosition(id) {
    const positions = getPortfolio();
    const remaining = positions.filter((position) => position.id !== id);
    if (remaining.length === positions.length) {
      return false;
    }
    savePortfolio(remaining);
    return true;
  }

  function withPortfolioDecisions(profiles) {
    const latestBySymbol = positionsBySymbol(getPortfolio());
    return profiles.map((profile) => {
      const position = latestBySymbol.get(profile.symbol);
      if (!position) {
        return profile;
      }
      return applyPosition(profile, position);
    });
  }

  function positionsBySymbol(positions) {
    const map = new Map();
    [...positions]
      .sort((a, b) => String(a.buy_date).localeCompare(String(b.buy_date)))
      .forEach((position) => map.set(position.symbol, position));
    return map;
  }

  function applyPosition(profile, position) {
    const copy = JSON.parse(JSON.stringify(profile));
    const decision = copy.decision || {};
    const current = numberValue(decision.current_price ?? copy.last_close);
    const stopLoss = numberValue(decision.stop_loss);
    const trailingStop = numberValue(decision.trailing_stop);
    const target1 = numberValue(decision.target1);
    const target2 = numberValue(decision.target2);
    const buyPrice = numberValue(position.buy_price);
    const quantity = numberValue(position.quantity);
    const verdict = copy.consideration?.verdict || "";
    const warnings = [...(decision.warnings || [])];
    const timeStopDays = decision.time_stop_days;
    const daysHeld = heldDays(copy, position.buy_date);
    const unrealizedPct = round((current / buyPrice - 1) * 100, 2);
    let action = "hold";

    if (
      current <= stopLoss ||
      (trailingStop && current <= trailingStop) ||
      ["ignore", "avoid", "sell pressure"].includes(verdict) ||
      decision.setup_type === "exit weakness" ||
      (timeStopDays && daysHeld >= timeStopDays && unrealizedPct < 0) ||
      current >= target2
    ) {
      action = "sell";
    }
    if (current <= stopLoss) {
      warnings.push("current price is at or below the calculated stop");
    } else if (trailingStop && current <= trailingStop) {
      warnings.push("current price is at or below the trailing stop");
    } else if (current >= target2) {
      warnings.push("second target has been reached");
    } else if (current >= target1) {
      warnings.push("first target has been reached");
    }
    if (timeStopDays && daysHeld >= timeStopDays && unrealizedPct < 0) {
      warnings.push(`time stop review after ${timeStopDays} days without progress`);
    }

    copy.decision = {
      ...decision,
      action,
      already_bought: true,
      buy_date: position.buy_date,
      buy_price: buyPrice,
      quantity,
      days_held: daysHeld,
      unrealized_pl_pct: unrealizedPct,
      unrealized_pl_value: round((current - buyPrice) * quantity, 2),
      reasons: unique([`already bought on ${position.buy_date} at ${buyPrice.toFixed(3)}`, ...(decision.reasons || [])]),
      warnings: unique(warnings),
    };
    return copy;
  }

  function heldDays(profile, buyDate) {
    const latestDate =
      profile.windows?.["7d"]?.end_date ||
      profile.windows?.["1m"]?.end_date ||
      latestSnapshot?.scanned_at?.slice(0, 10);
    const end = Date.parse(`${latestDate}T00:00:00Z`);
    const start = Date.parse(`${buyDate}T00:00:00Z`);
    if (!Number.isFinite(end) || !Number.isFinite(start)) {
      return null;
    }
    return Math.max(Math.floor((end - start) / 86400000), 0);
  }

  function summarize(profiles) {
    const summary = { total: profiles.length };
    profiles.forEach((profile) => {
      const verdict = profile.consideration?.verdict || "unknown";
      summary[verdict] = (summary[verdict] || 0) + 1;
    });
    return summary;
  }

  function toCsv(profiles) {
    const headers = [
      "symbol",
      "current_price",
      "verdict",
      "decision_action",
      "setup_type",
      "liquidity_tier",
      "suggested_buy_low",
      "suggested_buy_high",
      "stop_loss",
      "trailing_stop",
      "target1",
      "target2",
      "risk_reward",
      "stop_basis",
      "time_stop_days",
      "tick_size",
      "already_bought",
      "buy_date",
      "buy_price",
      "quantity",
      "unrealized_pl_pct",
      "score",
      "liquidity_score",
      "trend_score",
      "momentum_score",
      "volume_score",
      "risk_score",
      "rsi14",
      "avg_value20",
    ];
    const rows = profiles.map((profile) => {
      const consideration = profile.consideration || {};
      const decision = profile.decision || {};
      const indicators = consideration.indicators || {};
      return [
        profile.symbol,
        profile.last_close,
        consideration.verdict,
        decision.action,
        decision.setup_type,
        decision.liquidity_tier || consideration.liquidity_tier,
        decision.suggested_buy_low,
        decision.suggested_buy_high,
        decision.stop_loss,
        decision.trailing_stop,
        decision.target1,
        decision.target2,
        decision.risk_reward,
        decision.stop_basis,
        decision.time_stop_days,
        decision.tick_size,
        decision.already_bought,
        decision.buy_date,
        decision.buy_price,
        decision.quantity,
        decision.unrealized_pl_pct,
        consideration.score,
        consideration.liquidity_score,
        consideration.trend_score,
        consideration.momentum_score,
        consideration.volume_score,
        consideration.risk_score,
        indicators.rsi14,
        indicators.avg_value20,
      ];
    });
    return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function csvCell(value) {
    if (value === null || value === undefined) {
      return "";
    }
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function nextDubaiDailyScan() {
    const now = new Date();
    const dubaiNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    let candidateUtc = Date.UTC(
      dubaiNow.getUTCFullYear(),
      dubaiNow.getUTCMonth(),
      dubaiNow.getUTCDate(),
      4,
      5,
      0,
    );
    if (now.getTime() >= candidateUtc) {
      candidateUtc += 24 * 60 * 60 * 1000;
    }
    return new Date(candidateUtc).toISOString();
  }

  function incrementRefreshCount() {
    const count = Number(localStorage.getItem(SCAN_COUNT_KEY) || 0) + 1;
    localStorage.setItem(SCAN_COUNT_KEY, String(count));
  }

  function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function round(value, digits) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  }

  function unique(items) {
    return [...new Set(items.filter(Boolean))];
  }
})();
