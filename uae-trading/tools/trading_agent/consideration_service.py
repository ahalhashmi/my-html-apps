from __future__ import annotations

import csv
from pathlib import Path

from trading_agent.agents.consideration import ConsiderationAgent
from trading_agent.agents.trend import TrendAgent
from trading_agent.data import load_ohlcv_dir
from trading_agent.decision_service import build_trade_decision, trade_decision_to_dict
from trading_agent.models import ConsiderationProfile, IndicatorSnapshot, Position, TradeDecision, TrendProfile
from trading_agent.portfolio import positions_by_symbol
from trading_agent.trend_service import TREND_PERIODS, trend_profile_to_dict


def scan_considerations(
    data_dir: Path | str,
    market: str = "all",
    sort_key: str = "score",
) -> list[tuple[TrendProfile, ConsiderationProfile]]:
    universe = load_ohlcv_dir(Path(data_dir))
    if market != "all":
        prefix = f"{market}:"
        universe = {symbol: series for symbol, series in universe.items() if symbol.startswith(prefix)}

    trend_agent = TrendAgent()
    consideration_agent = ConsiderationAgent()
    rows: list[tuple[TrendProfile, ConsiderationProfile]] = []
    for series in universe.values():
        trend = trend_agent.analyze(series)
        consideration = consideration_agent.analyze(series, trend)
        rows.append((trend, consideration))
    return sort_considerations(rows, sort_key)


def sort_considerations(
    rows: list[tuple[TrendProfile, ConsiderationProfile]],
    sort_key: str = "score",
) -> list[tuple[TrendProfile, ConsiderationProfile]]:
    if sort_key == "symbol":
        return sorted(rows, key=lambda row: row[0].symbol)
    if sort_key == "liquidity":
        return sorted(rows, key=lambda row: row[1].liquidity_score, reverse=True)
    if sort_key == "trend":
        return sorted(rows, key=lambda row: row[1].trend_score, reverse=True)
    if sort_key == "momentum":
        return sorted(rows, key=lambda row: row[1].momentum_score, reverse=True)
    if sort_key == "volume":
        return sorted(rows, key=lambda row: row[1].volume_score, reverse=True)
    if sort_key == "risk":
        return sorted(rows, key=lambda row: row[1].risk_score, reverse=True)
    return sorted(rows, key=lambda row: row[1].score, reverse=True)


def build_decisions_for_rows(
    data_dir: Path | str,
    rows: list[tuple[TrendProfile, ConsiderationProfile]],
    positions: list[Position] | None = None,
) -> dict[str, TradeDecision]:
    universe = load_ohlcv_dir(Path(data_dir))
    position_map = positions_by_symbol(positions or [])
    decisions: dict[str, TradeDecision] = {}
    for trend, consideration in rows:
        series = universe[trend.symbol]
        decisions[trend.symbol] = build_trade_decision(series, consideration, position_map.get(trend.symbol))
    return decisions


def combined_profile_to_dict(
    trend: TrendProfile,
    consideration: ConsiderationProfile,
    decision: TradeDecision | None = None,
) -> dict[str, object]:
    payload = trend_profile_to_dict(trend)
    payload["consideration"] = consideration_to_dict(consideration)
    if decision is not None:
        payload["decision"] = trade_decision_to_dict(decision)
    return payload


def consideration_to_dict(profile: ConsiderationProfile) -> dict[str, object]:
    return {
        "symbol": profile.symbol,
        "verdict": profile.verdict,
        "score": profile.score,
        "last_close": profile.last_close,
        "liquidity_tier": profile.liquidity_tier,
        "liquidity_score": profile.liquidity_score,
        "trend_score": profile.trend_score,
        "momentum_score": profile.momentum_score,
        "volume_score": profile.volume_score,
        "risk_score": profile.risk_score,
        "indicators": indicators_to_dict(profile.indicators),
        "reasons": list(profile.reasons),
        "warnings": list(profile.warnings),
        "vetoes": list(profile.vetoes),
    }


def indicators_to_dict(indicators: IndicatorSnapshot) -> dict[str, object]:
    return {
        "sma20": _round(indicators.sma20),
        "sma50": _round(indicators.sma50),
        "sma200": _round(indicators.sma200),
        "ema20": _round(indicators.ema20),
        "ema50": _round(indicators.ema50),
        "ema100": _round(indicators.ema100),
        "sma20_slope_pct": _round(indicators.sma20_slope_pct),
        "sma50_slope_pct": _round(indicators.sma50_slope_pct),
        "rsi14": _round(indicators.rsi14),
        "macd": _round(indicators.macd),
        "macd_signal": _round(indicators.macd_signal),
        "macd_histogram": _round(indicators.macd_histogram),
        "adx14": _round(indicators.adx14),
        "plus_di14": _round(indicators.plus_di14),
        "minus_di14": _round(indicators.minus_di14),
        "atr14_pct": _round(indicators.atr14_pct),
        "roc20_pct": _round(indicators.roc20_pct),
        "avg_volume20": _round(indicators.avg_volume20),
        "avg_value20": _round(indicators.avg_value20),
        "relative_volume20": _round(indicators.relative_volume20),
        "active_volume_days20": indicators.active_volume_days20,
        "obv_slope20": _round(indicators.obv_slope20),
        "high_252": _round(indicators.high_252),
        "drawdown_from_high_pct": _round(indicators.drawdown_from_high_pct),
    }


def summarize_considerations(rows: list[tuple[TrendProfile, ConsiderationProfile]]) -> dict[str, int]:
    summary = {
        "buy candidate": 0,
        "setup forming": 0,
        "worth studying": 0,
        "watch": 0,
        "sell pressure": 0,
        "avoid": 0,
        "ignore": 0,
    }
    for _, profile in rows:
        summary[profile.verdict] = summary.get(profile.verdict, 0) + 1
    summary["total"] = len(rows)
    return summary


def write_consideration_csv(
    rows: list[tuple[TrendProfile, ConsiderationProfile]],
    path: Path | str,
    decisions: dict[str, TradeDecision] | None = None,
) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    headers = [
        "symbol",
        "last_close",
        "verdict",
        "opportunity_score",
        "liquidity_score",
        "trend_score",
        "momentum_score",
        "volume_score",
        "risk_score",
        "rsi14",
        "macd_histogram",
        "adx14",
        "atr14_pct",
        "avg_value20",
        "relative_volume20",
        "active_volume_days20",
        "liquidity_tier",
        "reasons",
        "warnings",
        "vetoes",
        "decision_action",
        "setup_type",
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
        "unrealized_pl_value",
    ]
    for period in TREND_PERIODS:
        headers.extend([f"{period}_direction", f"{period}_strength", f"{period}_return_pct"])

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for trend, profile in rows:
            indicators = profile.indicators
            row: dict[str, object] = {
                "symbol": profile.symbol,
                "last_close": profile.last_close,
                "verdict": profile.verdict,
                "opportunity_score": profile.score,
                "liquidity_score": profile.liquidity_score,
                "trend_score": profile.trend_score,
                "momentum_score": profile.momentum_score,
                "volume_score": profile.volume_score,
                "risk_score": profile.risk_score,
                "rsi14": _round(indicators.rsi14),
                "macd_histogram": _round(indicators.macd_histogram),
                "adx14": _round(indicators.adx14),
                "atr14_pct": _round(indicators.atr14_pct),
                "avg_value20": _round(indicators.avg_value20),
                "relative_volume20": _round(indicators.relative_volume20),
                "active_volume_days20": indicators.active_volume_days20,
                "liquidity_tier": profile.liquidity_tier,
                "reasons": " | ".join(profile.reasons),
                "warnings": " | ".join(profile.warnings),
                "vetoes": " | ".join(profile.vetoes),
            }
            for window in trend.windows:
                row[f"{window.name}_direction"] = window.direction
                row[f"{window.name}_strength"] = window.strength
                row[f"{window.name}_return_pct"] = window.return_pct
            decision = decisions.get(profile.symbol) if decisions else None
            if decision:
                row.update(
                    {
                        "decision_action": decision.action,
                        "setup_type": decision.setup_type,
                        "suggested_buy_low": decision.suggested_buy_low,
                        "suggested_buy_high": decision.suggested_buy_high,
                        "stop_loss": decision.stop_loss,
                        "trailing_stop": decision.trailing_stop,
                        "target1": decision.target1,
                        "target2": decision.target2,
                        "risk_reward": decision.risk_reward,
                        "stop_basis": decision.stop_basis,
                        "time_stop_days": decision.time_stop_days,
                        "tick_size": decision.tick_size,
                        "already_bought": decision.already_bought,
                        "buy_date": decision.buy_date.isoformat() if decision.buy_date else None,
                        "buy_price": decision.buy_price,
                        "quantity": decision.quantity,
                        "unrealized_pl_pct": decision.unrealized_pl_pct,
                        "unrealized_pl_value": decision.unrealized_pl_value,
                    }
                )
            writer.writerow(row)


def _round(value: float | None, digits: int = 4) -> float | None:
    return round(value, digits) if value is not None else None
