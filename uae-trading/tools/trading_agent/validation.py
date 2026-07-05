from __future__ import annotations

from collections import defaultdict
from contextlib import closing
from dataclasses import asdict, is_dataclass
from datetime import UTC, date, datetime
import json
from pathlib import Path
import sqlite3
from typing import Any

from trading_agent.data import load_ohlcv_dir
from trading_agent.models import Bar, MarketSeries


MODEL_VERSION = "uae-trading-model-2026-07-05-structure"
TERMINAL_STATUSES = {"target2", "stopped", "expired", "invalidated"}
SIGNAL_ACTIONS = {"buy", "watch"}
SIGNAL_VERDICTS = {"buy candidate", "setup forming", "worth studying"}


class ValidationStore:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def record_snapshot(
        self,
        snapshot: Any,
        data_dir: Path | str,
        model_version: str = MODEL_VERSION,
    ) -> dict[str, object]:
        payload = _snapshot_payload(snapshot)
        profiles = list(payload.get("profiles") or [])
        scanned_at = str(payload.get("scanned_at") or datetime.now(UTC).isoformat(timespec="seconds"))
        trigger = str(payload.get("trigger") or "scan")
        scan_date = _date_part(scanned_at)
        scan_id = f"{scanned_at}|{trigger}"
        universe = _load_universe(data_dir)

        with closing(self._connect()) as conn:
            inserted = self._insert_scan(conn, scan_id, payload, scan_date, scanned_at, trigger, model_version)
            if inserted:
                for profile in profiles:
                    self._insert_observation(conn, scan_id, scan_date, scanned_at, trigger, profile)
            self._update_open_signals(conn, profiles, universe, scanned_at)
            self._open_new_signals(conn, profiles, scanned_at, scan_date, trigger, model_version)
            conn.commit()

        return self.performance_report()

    def performance_report(self, limit: int = 40) -> dict[str, object]:
        with closing(self._connect()) as conn:
            signals = [dict(row) for row in conn.execute("SELECT * FROM signals ORDER BY opened_at DESC, id DESC")]
            observations = [
                dict(row)
                for row in conn.execute(
                    """
                    SELECT symbol, scan_date, scanned_at, data_date, verdict, action, setup_type,
                           setup_grade, liquidity_tier, regime, location, score
                    FROM decision_observations
                    ORDER BY symbol, scan_date, scanned_at
                    """
                )
            ]
            scan_count = conn.execute("SELECT COUNT(*) FROM scan_snapshots").fetchone()[0]
            observation_count = conn.execute("SELECT COUNT(*) FROM decision_observations").fetchone()[0]

        completed = [signal for signal in signals if signal["status"] in TERMINAL_STATUSES]
        entered = [signal for signal in signals if signal.get("entry_date")]
        target1_hits = [signal for signal in signals if signal.get("target1_date")]
        target2_hits = [signal for signal in signals if signal["status"] == "target2"]
        stopped = [signal for signal in signals if signal["status"] == "stopped"]
        expired = [signal for signal in signals if signal["status"] == "expired"]
        invalidated = [signal for signal in signals if signal["status"] == "invalidated"]
        open_signals = [signal for signal in signals if signal["status"] not in TERMINAL_STATUSES]
        closed_with_r = [signal for signal in completed if signal.get("r_multiple") is not None]

        summary = {
            "scan_count": scan_count,
            "observation_count": observation_count,
            "total_signals": len(signals),
            "open_signals": len(open_signals),
            "completed_signals": len(completed),
            "entered_signals": len(entered),
            "target1_hits": len(target1_hits),
            "target2_hits": len(target2_hits),
            "stopped": len(stopped),
            "expired": len(expired),
            "invalidated": len(invalidated),
            "target1_hit_rate": _pct(len(target1_hits), len(entered)),
            "target2_hit_rate": _pct(len(target2_hits), len(completed)),
            "stop_rate": _pct(len(stopped), len(completed)),
            "average_r": _avg(signal.get("r_multiple") for signal in closed_with_r),
            "average_days_to_entry": _avg(signal.get("days_to_entry") for signal in entered),
            "average_days_to_close": _avg(signal.get("days_to_close") for signal in completed),
        }

        stability = _build_stability(observations)
        summary["average_stability"] = _avg(item["stability_score"] for item in stability)
        summary["more_confident_count"] = sum(1 for item in stability if item["confidence"] == "more confident")
        summary["choppy_count"] = sum(1 for item in stability if item["confidence"] == "choppy")

        return {
            "summary": summary,
            "recent_signals": [_signal_payload(signal) for signal in signals[:limit]],
            "open_signals": [_signal_payload(signal) for signal in open_signals[:limit]],
            "by_setup": _group_signal_stats(signals, "setup_type"),
            "by_grade": _group_signal_stats(signals, "setup_grade"),
            "by_regime": _group_signal_stats(signals, "regime"),
            "by_tier": _group_signal_stats(signals, "liquidity_tier"),
            "stability": stability[:limit],
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        }

    def export_signals_csv(self, path: Path | str) -> None:
        import csv

        output_path = Path(path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn:
            rows = [dict(row) for row in conn.execute("SELECT * FROM signals ORDER BY opened_at DESC, id DESC")]
        headers = [
            "symbol",
            "opened_at",
            "status",
            "outcome",
            "initial_action",
            "initial_verdict",
            "setup_type",
            "setup_grade",
            "liquidity_tier",
            "regime",
            "location",
            "zone_score",
            "location_score",
            "confluence_score",
            "entry_low",
            "entry_high",
            "entry_date",
            "entry_price",
            "target1",
            "target1_date",
            "target2",
            "target2_date",
            "stop_loss",
            "stop_date",
            "closed_date",
            "close_price",
            "days_to_entry",
            "days_to_close",
            "r_multiple",
            "stability_score",
        ]
        with output_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            for row in rows:
                writer.writerow({header: row.get(header) for header in headers})

    def _ensure_schema(self) -> None:
        with closing(self._connect()) as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS scan_snapshots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scan_id TEXT NOT NULL UNIQUE,
                    scanned_at TEXT NOT NULL,
                    scan_date TEXT NOT NULL,
                    trigger TEXT NOT NULL,
                    model_version TEXT NOT NULL,
                    profile_count INTEGER NOT NULL,
                    summary_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS decision_observations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scan_id TEXT NOT NULL,
                    scan_date TEXT NOT NULL,
                    scanned_at TEXT NOT NULL,
                    data_date TEXT,
                    trigger TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    last_close REAL,
                    verdict TEXT,
                    action TEXT,
                    setup_type TEXT,
                    setup_grade TEXT,
                    liquidity_tier TEXT,
                    regime TEXT,
                    location TEXT,
                    score REAL,
                    zone_score REAL,
                    location_score REAL,
                    confluence_score REAL,
                    demand_zone_low REAL,
                    demand_zone_high REAL,
                    supply_zone_low REAL,
                    supply_zone_high REAL,
                    buy_low REAL,
                    buy_high REAL,
                    stop_loss REAL,
                    trailing_stop REAL,
                    target1 REAL,
                    target2 REAL,
                    risk_reward REAL,
                    time_stop_days INTEGER,
                    reasons_json TEXT NOT NULL,
                    warnings_json TEXT NOT NULL,
                    vetoes_json TEXT NOT NULL,
                    UNIQUE(scan_id, symbol)
                );

                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    opened_at TEXT NOT NULL,
                    opened_date TEXT NOT NULL,
                    as_of_date TEXT,
                    trigger TEXT NOT NULL,
                    model_version TEXT NOT NULL,
                    initial_verdict TEXT,
                    initial_action TEXT,
                    setup_type TEXT,
                    setup_grade TEXT,
                    liquidity_tier TEXT,
                    regime TEXT,
                    location TEXT,
                    zone_score REAL,
                    location_score REAL,
                    confluence_score REAL,
                    entry_low REAL,
                    entry_high REAL,
                    stop_loss REAL,
                    trailing_stop REAL,
                    target1 REAL,
                    target2 REAL,
                    risk_reward REAL,
                    time_stop_days INTEGER,
                    status TEXT NOT NULL,
                    outcome TEXT NOT NULL,
                    entry_date TEXT,
                    entry_price REAL,
                    target1_date TEXT,
                    target2_date TEXT,
                    stop_date TEXT,
                    closed_date TEXT,
                    close_price REAL,
                    days_to_entry INTEGER,
                    days_to_close INTEGER,
                    max_gain_pct REAL,
                    max_drawdown_pct REAL,
                    r_multiple REAL,
                    observation_count INTEGER NOT NULL DEFAULT 1,
                    verdict_changes INTEGER NOT NULL DEFAULT 0,
                    action_changes INTEGER NOT NULL DEFAULT 0,
                    setup_changes INTEGER NOT NULL DEFAULT 0,
                    stability_score REAL NOT NULL DEFAULT 100,
                    last_seen_at TEXT,
                    last_seen_date TEXT,
                    last_verdict TEXT,
                    last_action TEXT,
                    last_setup TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_observations_symbol_date
                ON decision_observations(symbol, scan_date, scanned_at);

                CREATE INDEX IF NOT EXISTS idx_signals_symbol_status
                ON signals(symbol, status);
                """
            )
            self._ensure_columns(
                conn,
                "decision_observations",
                {
                    "setup_grade": "TEXT",
                    "regime": "TEXT",
                    "location": "TEXT",
                    "zone_score": "REAL",
                    "location_score": "REAL",
                    "confluence_score": "REAL",
                    "demand_zone_low": "REAL",
                    "demand_zone_high": "REAL",
                    "supply_zone_low": "REAL",
                    "supply_zone_high": "REAL",
                },
            )
            self._ensure_columns(
                conn,
                "signals",
                {
                    "setup_grade": "TEXT",
                    "regime": "TEXT",
                    "location": "TEXT",
                    "zone_score": "REAL",
                    "location_score": "REAL",
                    "confluence_score": "REAL",
                },
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _ensure_columns(self, conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column, column_type in columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")

    def _insert_scan(
        self,
        conn: sqlite3.Connection,
        scan_id: str,
        payload: dict[str, Any],
        scan_date: str,
        scanned_at: str,
        trigger: str,
        model_version: str,
    ) -> bool:
        cursor = conn.execute(
            """
            INSERT OR IGNORE INTO scan_snapshots
            (scan_id, scanned_at, scan_date, trigger, model_version, profile_count, summary_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                scanned_at,
                scan_date,
                trigger,
                model_version,
                len(payload.get("profiles") or []),
                json.dumps(payload.get("summary") or {}, sort_keys=True),
            ),
        )
        return cursor.rowcount > 0

    def _insert_observation(
        self,
        conn: sqlite3.Connection,
        scan_id: str,
        scan_date: str,
        scanned_at: str,
        trigger: str,
        profile: dict[str, Any],
    ) -> None:
        consideration = profile.get("consideration") or {}
        decision = profile.get("decision") or {}
        conn.execute(
            """
            INSERT OR IGNORE INTO decision_observations
            (
                scan_id, scan_date, scanned_at, data_date, trigger, symbol, last_close, verdict, action,
                setup_type, setup_grade, liquidity_tier, regime, location, score, zone_score,
                location_score, confluence_score, demand_zone_low, demand_zone_high, supply_zone_low,
                supply_zone_high, buy_low, buy_high, stop_loss, trailing_stop, target1, target2,
                risk_reward, time_stop_days, reasons_json, warnings_json, vetoes_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                scan_date,
                scanned_at,
                _profile_data_date(profile),
                trigger,
                profile.get("symbol"),
                _number(profile.get("last_close")),
                consideration.get("verdict"),
                decision.get("action"),
                decision.get("setup_type"),
                decision.get("setup_grade"),
                decision.get("liquidity_tier") or consideration.get("liquidity_tier"),
                decision.get("regime") or consideration.get("regime"),
                decision.get("location") or consideration.get("location"),
                _number(consideration.get("score")),
                _number(decision.get("zone_score") or consideration.get("zone_score")),
                _number(decision.get("location_score") or consideration.get("location_score")),
                _number(decision.get("confluence_score") or consideration.get("confluence_score")),
                _number(decision.get("demand_zone_low") or consideration.get("demand_zone_low")),
                _number(decision.get("demand_zone_high") or consideration.get("demand_zone_high")),
                _number(decision.get("supply_zone_low") or consideration.get("supply_zone_low")),
                _number(decision.get("supply_zone_high") or consideration.get("supply_zone_high")),
                _number(decision.get("suggested_buy_low")),
                _number(decision.get("suggested_buy_high")),
                _number(decision.get("stop_loss")),
                _number(decision.get("trailing_stop")),
                _number(decision.get("target1")),
                _number(decision.get("target2")),
                _number(decision.get("risk_reward")),
                _integer(decision.get("time_stop_days")),
                json.dumps(decision.get("reasons") or consideration.get("reasons") or []),
                json.dumps(decision.get("warnings") or consideration.get("warnings") or []),
                json.dumps(consideration.get("vetoes") or []),
            ),
        )

    def _update_open_signals(
        self,
        conn: sqlite3.Connection,
        profiles: list[dict[str, Any]],
        universe: dict[str, MarketSeries],
        scanned_at: str,
    ) -> None:
        profiles_by_symbol = {str(profile.get("symbol")): profile for profile in profiles}
        rows = [
            dict(row)
            for row in conn.execute(
                "SELECT * FROM signals WHERE status NOT IN ('target2', 'stopped', 'expired', 'invalidated')"
            )
        ]
        for signal in rows:
            profile = profiles_by_symbol.get(signal["symbol"])
            if profile:
                self._update_signal_stability(conn, signal, profile, scanned_at)
            current = dict(conn.execute("SELECT * FROM signals WHERE id = ?", (signal["id"],)).fetchone())
            series = universe.get(signal["symbol"])
            if profile and series:
                self._evaluate_signal(conn, current, profile, series, scanned_at)

    def _update_signal_stability(
        self,
        conn: sqlite3.Connection,
        signal: dict[str, Any],
        profile: dict[str, Any],
        scanned_at: str,
    ) -> None:
        consideration = profile.get("consideration") or {}
        decision = profile.get("decision") or {}
        verdict = str(consideration.get("verdict") or "")
        action = str(decision.get("action") or "")
        setup = str(decision.get("setup_type") or "")
        observation_count = int(signal.get("observation_count") or 0) + 1
        verdict_changes = int(signal.get("verdict_changes") or 0)
        action_changes = int(signal.get("action_changes") or 0)
        setup_changes = int(signal.get("setup_changes") or 0)

        if signal.get("last_verdict") and signal.get("last_verdict") != verdict:
            verdict_changes += 1
        if signal.get("last_action") and signal.get("last_action") != action:
            action_changes += 1
        if signal.get("last_setup") and signal.get("last_setup") != setup:
            setup_changes += 1

        stability_score = _stability_score(observation_count, verdict_changes, action_changes, setup_changes)
        conn.execute(
            """
            UPDATE signals
            SET observation_count = ?, verdict_changes = ?, action_changes = ?, setup_changes = ?,
                stability_score = ?, last_seen_at = ?, last_seen_date = ?, last_verdict = ?,
                last_action = ?, last_setup = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                observation_count,
                verdict_changes,
                action_changes,
                setup_changes,
                stability_score,
                scanned_at,
                _profile_data_date(profile),
                verdict,
                action,
                setup,
                scanned_at,
                signal["id"],
            ),
        )

    def _evaluate_signal(
        self,
        conn: sqlite3.Connection,
        signal: dict[str, Any],
        profile: dict[str, Any],
        series: MarketSeries,
        scanned_at: str,
    ) -> None:
        data_date = _parse_date(_profile_data_date(profile))
        if data_date is None:
            return
        decision = profile.get("decision") or {}
        consideration = profile.get("consideration") or {}
        if signal["status"] == "waiting_entry" and _invalidates_waiting_signal(decision, consideration):
            self._close_signal(conn, signal, "invalidated", "decision invalidated before entry", scanned_at, data_date, None, None)
            return

        bars = [bar for bar in series.bars if bar.date <= data_date]
        if not bars:
            return

        entry_date = _parse_date(signal.get("entry_date"))
        entry_price = _number(signal.get("entry_price"))
        as_of_date = _parse_date(signal.get("as_of_date") or signal.get("opened_date"))
        status = signal["status"]
        target1_date = _parse_date(signal.get("target1_date"))

        if status == "waiting_entry":
            entry_bar = _find_entry_bar(bars, as_of_date, signal)
            if entry_bar is not None:
                entry_date = entry_bar.date
                entry_price = _entry_price(entry_bar, signal)
                status = "active"
                conn.execute(
                    """
                    UPDATE signals
                    SET status = ?, outcome = ?, entry_date = ?, entry_price = ?,
                        days_to_entry = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        status,
                        "entered buy zone",
                        entry_date.isoformat(),
                        entry_price,
                        (entry_date - _parse_date(signal["opened_date"])).days,
                        scanned_at,
                        signal["id"],
                    ),
                )
                signal = dict(conn.execute("SELECT * FROM signals WHERE id = ?", (signal["id"],)).fetchone())

        if status in {"active", "target1_hit"} and entry_date is not None and entry_price:
            self._evaluate_entered_signal(conn, signal, bars, entry_date, entry_price, target1_date, scanned_at)
            return

        if status == "waiting_entry":
            self._expire_waiting_signal_if_stale(conn, signal, bars, scanned_at)

    def _evaluate_entered_signal(
        self,
        conn: sqlite3.Connection,
        signal: dict[str, Any],
        bars: list[Bar],
        entry_date: date,
        entry_price: float,
        target1_date: date | None,
        scanned_at: str,
    ) -> None:
        stop_loss = _number(signal.get("stop_loss"))
        target1 = _number(signal.get("target1"))
        target2 = _number(signal.get("target2"))
        risk_per_share = entry_price - stop_loss if entry_price and stop_loss else None
        max_high = entry_price
        min_low = entry_price
        bars_since_entry = 0

        for bar in bars:
            if bar.date < entry_date:
                continue
            bars_since_entry += 1
            max_high = max(max_high, bar.high)
            min_low = min(min_low, bar.low)
            if stop_loss and bar.low <= stop_loss:
                self._close_signal(
                    conn,
                    signal,
                    "stopped",
                    "stop hit before final target",
                    scanned_at,
                    bar.date,
                    stop_loss,
                    _r_multiple(entry_price, stop_loss, risk_per_share),
                    max_high,
                    min_low,
                )
                return
            if target1 and target1_date is None and bar.high >= target1:
                target1_date = bar.date
                conn.execute(
                    "UPDATE signals SET status = ?, outcome = ?, target1_date = ?, updated_at = ? WHERE id = ?",
                    ("target1_hit", "first target hit", target1_date.isoformat(), scanned_at, signal["id"]),
                )
            if target2 and bar.high >= target2:
                self._close_signal(
                    conn,
                    signal,
                    "target2",
                    "second target hit",
                    scanned_at,
                    bar.date,
                    target2,
                    _r_multiple(entry_price, target2, risk_per_share),
                    max_high,
                    min_low,
                    target2_date=bar.date,
                )
                return

        time_stop_days = _integer(signal.get("time_stop_days"))
        if time_stop_days and bars_since_entry >= time_stop_days:
            last_bar = bars[-1]
            self._close_signal(
                conn,
                signal,
                "expired",
                "time stop reached",
                scanned_at,
                last_bar.date,
                last_bar.close,
                _r_multiple(entry_price, last_bar.close, risk_per_share),
                max_high,
                min_low,
            )

    def _expire_waiting_signal_if_stale(
        self,
        conn: sqlite3.Connection,
        signal: dict[str, Any],
        bars: list[Bar],
        scanned_at: str,
    ) -> None:
        as_of_date = _parse_date(signal.get("as_of_date") or signal.get("opened_date"))
        if as_of_date is None:
            return
        time_stop_days = _integer(signal.get("time_stop_days")) or 20
        bars_after_signal = [bar for bar in bars if bar.date > as_of_date]
        if len(bars_after_signal) >= time_stop_days:
            last_bar = bars[-1]
            self._close_signal(conn, signal, "expired", "buy zone was not reached", scanned_at, last_bar.date, last_bar.close, 0)

    def _close_signal(
        self,
        conn: sqlite3.Connection,
        signal: dict[str, Any],
        status: str,
        outcome: str,
        scanned_at: str,
        close_date: date,
        close_price: float | None,
        r_multiple: float | None,
        max_high: float | None = None,
        min_low: float | None = None,
        target2_date: date | None = None,
    ) -> None:
        entry_price = _number(signal.get("entry_price"))
        opened_date = _parse_date(signal["opened_date"])
        entry_date = _parse_date(signal.get("entry_date"))
        conn.execute(
            """
            UPDATE signals
            SET status = ?, outcome = ?, closed_date = ?, close_price = ?, stop_date = ?,
                target2_date = COALESCE(?, target2_date), days_to_close = ?, max_gain_pct = ?,
                max_drawdown_pct = ?, r_multiple = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                status,
                outcome,
                close_date.isoformat(),
                _round(close_price),
                close_date.isoformat() if status == "stopped" else None,
                target2_date.isoformat() if target2_date else None,
                (close_date - (entry_date or opened_date)).days if opened_date else None,
                _pct_change(max_high, entry_price),
                _pct_change(min_low, entry_price),
                _round(r_multiple),
                scanned_at,
                signal["id"],
            ),
        )

    def _open_new_signals(
        self,
        conn: sqlite3.Connection,
        profiles: list[dict[str, Any]],
        scanned_at: str,
        scan_date: str,
        trigger: str,
        model_version: str,
    ) -> None:
        for profile in profiles:
            if not _is_signal_candidate(profile):
                continue
            symbol = str(profile.get("symbol") or "")
            existing = conn.execute(
                """
                SELECT id FROM signals
                WHERE symbol = ?
                AND (status NOT IN ('target2', 'stopped', 'expired', 'invalidated') OR updated_at = ?)
                """,
                (symbol, scanned_at),
            ).fetchone()
            if existing:
                continue

            consideration = profile.get("consideration") or {}
            decision = profile.get("decision") or {}
            conn.execute(
                """
                INSERT INTO signals
                (
                    symbol, opened_at, opened_date, as_of_date, trigger, model_version,
                    initial_verdict, initial_action, setup_type, setup_grade, liquidity_tier,
                    regime, location, zone_score, location_score, confluence_score, entry_low,
                    entry_high, stop_loss, trailing_stop, target1, target2, risk_reward,
                    time_stop_days, status, outcome, last_seen_at, last_seen_date,
                    last_verdict, last_action, last_setup, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    symbol,
                    scanned_at,
                    scan_date,
                    _profile_data_date(profile),
                    trigger,
                    model_version,
                    consideration.get("verdict"),
                    decision.get("action"),
                    decision.get("setup_type"),
                    decision.get("setup_grade"),
                    decision.get("liquidity_tier") or consideration.get("liquidity_tier"),
                    decision.get("regime") or consideration.get("regime"),
                    decision.get("location") or consideration.get("location"),
                    _number(decision.get("zone_score") or consideration.get("zone_score")),
                    _number(decision.get("location_score") or consideration.get("location_score")),
                    _number(decision.get("confluence_score") or consideration.get("confluence_score")),
                    _number(decision.get("suggested_buy_low")),
                    _number(decision.get("suggested_buy_high")),
                    _number(decision.get("stop_loss")),
                    _number(decision.get("trailing_stop")),
                    _number(decision.get("target1")),
                    _number(decision.get("target2")),
                    _number(decision.get("risk_reward")),
                    _integer(decision.get("time_stop_days")),
                    "waiting_entry",
                    "waiting for buy zone",
                    scanned_at,
                    _profile_data_date(profile),
                    consideration.get("verdict"),
                    decision.get("action"),
                    decision.get("setup_type"),
                    scanned_at,
                ),
            )


def _snapshot_payload(snapshot: Any) -> dict[str, Any]:
    if isinstance(snapshot, dict):
        return snapshot
    if is_dataclass(snapshot):
        return asdict(snapshot)
    if hasattr(snapshot, "__dict__"):
        return dict(snapshot.__dict__)
    raise TypeError("snapshot must be a dictionary or dataclass")


def _load_universe(data_dir: Path | str) -> dict[str, MarketSeries]:
    try:
        return load_ohlcv_dir(Path(data_dir))
    except (FileNotFoundError, ValueError):
        return {}


def _profile_data_date(profile: dict[str, Any]) -> str | None:
    windows = profile.get("windows") or {}
    dates = []
    if isinstance(windows, dict):
        for window in windows.values():
            if isinstance(window, dict) and window.get("end_date"):
                parsed = _parse_date(window.get("end_date"))
                if parsed:
                    dates.append(parsed)
    if not dates:
        return None
    return max(dates).isoformat()


def _find_entry_bar(bars: list[Bar], as_of_date: date | None, signal: dict[str, Any]) -> Bar | None:
    entry_low = _number(signal.get("entry_low"))
    entry_high = _number(signal.get("entry_high"))
    if entry_low is None or entry_high is None:
        return None
    for bar in bars:
        if as_of_date is not None and bar.date <= as_of_date:
            continue
        if bar.low <= entry_high and bar.high >= entry_low:
            return bar
    return None


def _entry_price(bar: Bar, signal: dict[str, Any]) -> float:
    entry_low = _number(signal.get("entry_low")) or bar.close
    entry_high = _number(signal.get("entry_high")) or bar.close
    if entry_low <= bar.open <= entry_high:
        return _round(bar.open) or bar.open
    return _round(entry_high) or entry_high


def _is_signal_candidate(profile: dict[str, Any]) -> bool:
    consideration = profile.get("consideration") or {}
    decision = profile.get("decision") or {}
    if decision.get("already_bought"):
        return False
    action = decision.get("action")
    verdict = consideration.get("verdict")
    setup = decision.get("setup_type")
    if action not in SIGNAL_ACTIONS:
        return False
    if verdict not in SIGNAL_VERDICTS:
        return False
    if setup in {None, "", "unqualified", "exit weakness"}:
        return False
    required = ("suggested_buy_low", "suggested_buy_high", "stop_loss", "target1", "target2")
    return all(_number(decision.get(key)) is not None for key in required)


def _invalidates_waiting_signal(decision: dict[str, Any], consideration: dict[str, Any]) -> bool:
    return (
        decision.get("action") in {"sell", "skip"}
        and consideration.get("verdict") in {"sell pressure", "avoid", "ignore"}
    ) or decision.get("setup_type") in {"unqualified", "exit weakness"}


def _build_stability(observations: list[dict[str, Any]]) -> list[dict[str, object]]:
    by_symbol_date: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for observation in observations:
        by_symbol_date[observation["symbol"]][observation["scan_date"]] = observation

    rows = []
    for symbol, daily_map in by_symbol_date.items():
        items = [daily_map[key] for key in sorted(daily_map)]
        if not items:
            continue
        action_changes = _count_changes(items, "action")
        verdict_changes = _count_changes(items, "verdict")
        setup_changes = _count_changes(items, "setup_type")
        days_tracked = len(items)
        score = _stability_score(days_tracked, verdict_changes, action_changes, setup_changes)
        last = items[-1]
        stable_streak = _stable_streak(items)
        if score >= 80 and stable_streak >= 3:
            confidence = "more confident"
        elif score >= 60:
            confidence = "steady"
        else:
            confidence = "choppy"
        rows.append(
            {
                "symbol": symbol,
                "days_tracked": days_tracked,
                "stable_streak": stable_streak,
                "verdict_changes": verdict_changes,
                "action_changes": action_changes,
                "setup_changes": setup_changes,
                "stability_score": _round(score),
                "confidence": confidence,
                "last_date": last.get("scan_date"),
                "data_date": last.get("data_date"),
                "last_verdict": last.get("verdict"),
                "last_action": last.get("action"),
                "last_setup": last.get("setup_type"),
                "setup_grade": last.get("setup_grade"),
                "regime": last.get("regime"),
                "location": last.get("location"),
                "liquidity_tier": last.get("liquidity_tier"),
                "score": _round(last.get("score")),
            }
        )
    return sorted(rows, key=lambda row: (row["confidence"] != "more confident", -(row["stability_score"] or 0), row["symbol"]))


def _group_signal_stats(signals: list[dict[str, Any]], key: str) -> list[dict[str, object]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for signal in signals:
        groups[str(signal.get(key) or "unknown")].append(signal)
    rows = []
    for name, group in groups.items():
        completed = [signal for signal in group if signal["status"] in TERMINAL_STATUSES]
        target2 = [signal for signal in group if signal["status"] == "target2"]
        stopped = [signal for signal in group if signal["status"] == "stopped"]
        rows.append(
            {
                "name": name,
                "total": len(group),
                "open": sum(1 for signal in group if signal["status"] not in TERMINAL_STATUSES),
                "completed": len(completed),
                "target2_hits": len(target2),
                "stopped": len(stopped),
                "target2_hit_rate": _pct(len(target2), len(completed)),
                "average_r": _avg(signal.get("r_multiple") for signal in completed if signal.get("r_multiple") is not None),
                "average_days_to_close": _avg(signal.get("days_to_close") for signal in completed),
            }
        )
    return sorted(rows, key=lambda row: (row["total"], row.get("average_r") or -999), reverse=True)


def _signal_payload(signal: dict[str, Any]) -> dict[str, object]:
    keys = [
        "id",
        "symbol",
        "opened_at",
        "opened_date",
        "as_of_date",
        "trigger",
        "initial_verdict",
        "initial_action",
        "setup_type",
        "setup_grade",
        "liquidity_tier",
        "regime",
        "location",
        "zone_score",
        "location_score",
        "confluence_score",
        "entry_low",
        "entry_high",
        "stop_loss",
        "target1",
        "target2",
        "risk_reward",
        "time_stop_days",
        "status",
        "outcome",
        "entry_date",
        "entry_price",
        "target1_date",
        "target2_date",
        "closed_date",
        "close_price",
        "days_to_entry",
        "days_to_close",
        "max_gain_pct",
        "max_drawdown_pct",
        "r_multiple",
        "observation_count",
        "verdict_changes",
        "action_changes",
        "setup_changes",
        "stability_score",
    ]
    return {key: signal.get(key) for key in keys}


def _count_changes(items: list[dict[str, Any]], key: str) -> int:
    changes = 0
    previous = None
    for item in items:
        value = item.get(key)
        if previous is not None and value != previous:
            changes += 1
        previous = value
    return changes


def _stable_streak(items: list[dict[str, Any]]) -> int:
    if not items:
        return 0
    last = items[-1]
    streak = 0
    for item in reversed(items):
        if (
            item.get("action") == last.get("action")
            and item.get("verdict") == last.get("verdict")
            and item.get("setup_type") == last.get("setup_type")
        ):
            streak += 1
        else:
            break
    return streak


def _stability_score(observation_count: int, verdict_changes: int, action_changes: int, setup_changes: int) -> float:
    transitions = max(observation_count - 1, 1)
    weighted_changes = action_changes * 0.5 + verdict_changes * 0.3 + setup_changes * 0.2
    return round(max(0.0, 1 - min(weighted_changes / transitions, 1)) * 100, 2)


def _date_part(value: str) -> str:
    parsed = _parse_datetime(value)
    return parsed.date().isoformat() if parsed else value[:10]


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _parse_date(value: Any) -> date | None:
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _integer(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _round(value: Any, digits: int = 2) -> float | None:
    number = _number(value)
    return round(number, digits) if number is not None else None


def _pct(numerator: int, denominator: int) -> float | None:
    if denominator <= 0:
        return None
    return round(numerator / denominator * 100, 2)


def _pct_change(value: float | None, base: float | None) -> float | None:
    if value is None or base in {None, 0}:
        return None
    return round((value / base - 1) * 100, 2)


def _avg(values: Any) -> float | None:
    usable = [float(value) for value in values if value is not None]
    if not usable:
        return None
    return round(sum(usable) / len(usable), 2)


def _r_multiple(entry_price: float, exit_price: float | None, risk_per_share: float | None) -> float | None:
    if exit_price is None or not risk_per_share or risk_per_share <= 0:
        return None
    return (exit_price - entry_price) / risk_per_share
