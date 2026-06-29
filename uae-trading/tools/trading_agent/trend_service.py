from __future__ import annotations

import csv
from datetime import date
from pathlib import Path

from trading_agent.agents.trend import TrendAgent
from trading_agent.data import load_ohlcv_dir
from trading_agent.models import TrendProfile, TrendWindow


TREND_PERIODS = ("7d", "1m", "6m", "1y")


def scan_trends(data_dir: Path | str, market: str = "all", sort_key: str = "overall") -> list[TrendProfile]:
    universe = load_ohlcv_dir(Path(data_dir))
    if market != "all":
        prefix = f"{market}:"
        universe = {symbol: series for symbol, series in universe.items() if symbol.startswith(prefix)}
    profiles = TrendAgent().scan(universe)
    return sort_trend_profiles(profiles, sort_key)


def sort_trend_profiles(profiles: list[TrendProfile], sort_key: str) -> list[TrendProfile]:
    if sort_key == "overall":
        return sorted(profiles, key=lambda profile: abs(profile.overall_score), reverse=True)

    return sorted(
        profiles,
        key=lambda profile: abs(_window_by_name(profile, sort_key).strength),
        reverse=True,
    )


def trend_profile_to_dict(profile: TrendProfile) -> dict[str, object]:
    return {
        "symbol": profile.symbol,
        "last_close": profile.last_close,
        "overall_direction": profile.overall_direction,
        "overall_score": profile.overall_score,
        "windows": {window.name: trend_window_to_dict(window) for window in profile.windows},
    }


def trend_window_to_dict(window: TrendWindow) -> dict[str, object]:
    return {
        "name": window.name,
        "direction": window.direction,
        "strength": window.strength,
        "return_pct": window.return_pct,
        "daily_rate_pct": window.daily_rate_pct,
        "volatility_pct": window.volatility_pct,
        "start_date": _date_to_str(window.start_date),
        "end_date": _date_to_str(window.end_date),
        "bars": window.bars,
        "note": window.note,
    }


def summarize_profiles(profiles: list[TrendProfile]) -> dict[str, int]:
    summary = {"bullish": 0, "bearish": 0, "sideways": 0, "unknown": 0}
    for profile in profiles:
        summary[profile.overall_direction] = summary.get(profile.overall_direction, 0) + 1
    summary["total"] = len(profiles)
    return summary


def write_trend_csv(profiles: list[TrendProfile], path: Path | str) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    headers = ["symbol", "last_close", "overall_direction", "overall_score"]
    for period in TREND_PERIODS:
        headers.extend(
            [
                f"{period}_direction",
                f"{period}_strength",
                f"{period}_return_pct",
                f"{period}_daily_rate_pct",
                f"{period}_volatility_pct",
                f"{period}_bars",
                f"{period}_note",
            ]
        )

    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for profile in profiles:
            row: dict[str, object] = {
                "symbol": profile.symbol,
                "last_close": profile.last_close,
                "overall_direction": profile.overall_direction,
                "overall_score": profile.overall_score,
            }
            windows = {window.name: window for window in profile.windows}
            for period in TREND_PERIODS:
                window = windows[period]
                row.update(
                    {
                        f"{period}_direction": window.direction,
                        f"{period}_strength": window.strength,
                        f"{period}_return_pct": window.return_pct,
                        f"{period}_daily_rate_pct": window.daily_rate_pct,
                        f"{period}_volatility_pct": window.volatility_pct,
                        f"{period}_bars": window.bars,
                        f"{period}_note": window.note,
                    }
                )
            writer.writerow(row)


def _window_by_name(profile: TrendProfile, name: str) -> TrendWindow:
    for window in profile.windows:
        if window.name == name:
            return window
    raise KeyError(name)


def _date_to_str(value: date | None) -> str | None:
    return value.isoformat() if value else None
