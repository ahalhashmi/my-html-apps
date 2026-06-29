from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from math import sqrt
from statistics import pstdev

from trading_agent.models import MarketSeries, TrendProfile, TrendWindow


@dataclass(frozen=True)
class TrendPeriod:
    name: str
    calendar_days: int
    min_bars: int
    flat_move_pct: float
    strong_move_pct: float
    weight: float


DEFAULT_TREND_PERIODS: tuple[TrendPeriod, ...] = (
    TrendPeriod("7d", calendar_days=7, min_bars=3, flat_move_pct=0.75, strong_move_pct=3.0, weight=0.20),
    TrendPeriod("1m", calendar_days=30, min_bars=10, flat_move_pct=2.0, strong_move_pct=8.0, weight=0.30),
    TrendPeriod("6m", calendar_days=183, min_bars=60, flat_move_pct=6.0, strong_move_pct=20.0, weight=0.30),
    TrendPeriod("1y", calendar_days=365, min_bars=120, flat_move_pct=10.0, strong_move_pct=35.0, weight=0.20),
)


class TrendAgent:
    def __init__(self, periods: tuple[TrendPeriod, ...] = DEFAULT_TREND_PERIODS) -> None:
        self.periods = periods

    def scan(self, universe: dict[str, MarketSeries]) -> list[TrendProfile]:
        profiles = [self.analyze(series) for series in universe.values()]
        profiles.sort(key=lambda profile: abs(profile.overall_score), reverse=True)
        return profiles

    def analyze(self, series: MarketSeries) -> TrendProfile:
        windows = tuple(self._analyze_period(series, period) for period in self.periods)
        weighted_total = 0.0
        used_weight = 0.0

        for window, period in zip(windows, self.periods):
            signed_strength = _signed_strength(window.direction, window.strength)
            if signed_strength is None:
                continue
            weighted_total += signed_strength * period.weight
            used_weight += period.weight

        overall_score = weighted_total / used_weight if used_weight else 0.0
        overall_direction = _direction_from_score(overall_score)

        return TrendProfile(
            symbol=series.symbol,
            last_close=series.last.close,
            overall_direction=overall_direction,
            overall_score=round(overall_score, 1),
            windows=windows,
        )

    def _analyze_period(self, series: MarketSeries, period: TrendPeriod) -> TrendWindow:
        bars = series.bars
        if len(bars) < 2:
            return TrendWindow(
                name=period.name,
                direction="unknown",
                strength=0.0,
                return_pct=None,
                daily_rate_pct=None,
                volatility_pct=None,
                start_date=None,
                end_date=series.last.date if bars else None,
                bars=len(bars),
                note="need at least two bars",
            )

        end = bars[-1]
        start_cutoff = end.date - timedelta(days=period.calendar_days)
        window_bars = tuple(bar for bar in bars if bar.date >= start_cutoff)

        if len(window_bars) < 2:
            window_bars = bars[-2:]

        start = window_bars[0]
        return_pct = (end.close / start.close - 1) * 100
        elapsed_days = max((end.date - start.date).days, 1)
        daily_rate_pct = return_pct / elapsed_days
        daily_returns = [
            (current.close / previous.close - 1) * 100
            for previous, current in zip(window_bars[:-1], window_bars[1:])
            if previous.close > 0
        ]
        volatility_pct = pstdev(daily_returns) * sqrt(len(daily_returns)) if len(daily_returns) > 1 else 0.0
        efficiency = _trend_efficiency([bar.close for bar in window_bars])

        if len(window_bars) < period.min_bars:
            return TrendWindow(
                name=period.name,
                direction="unknown",
                strength=0.0,
                return_pct=round(return_pct, 2),
                daily_rate_pct=round(daily_rate_pct, 4),
                volatility_pct=round(volatility_pct, 2),
                start_date=start.date,
                end_date=end.date,
                bars=len(window_bars),
                note=f"insufficient data: {len(window_bars)} bars, need {period.min_bars}",
            )

        direction = _classify_direction(return_pct, period.flat_move_pct)
        if direction == "sideways":
            strength = min(abs(return_pct) / period.flat_move_pct * 25, 25)
        else:
            return_component = min(abs(return_pct) / period.strong_move_pct, 1.0) * 55
            signal_to_noise = abs(return_pct) / max(volatility_pct, 0.01)
            noise_component = min(signal_to_noise / 1.5, 1.0) * 30
            efficiency_component = efficiency * 15
            strength = return_component + noise_component + efficiency_component

        return TrendWindow(
            name=period.name,
            direction=direction,
            strength=round(min(strength, 100), 1),
            return_pct=round(return_pct, 2),
            daily_rate_pct=round(daily_rate_pct, 4),
            volatility_pct=round(volatility_pct, 2),
            start_date=start.date,
            end_date=end.date,
            bars=len(window_bars),
        )


def _classify_direction(return_pct: float, flat_move_pct: float) -> str:
    if return_pct > flat_move_pct:
        return "bullish"
    if return_pct < -flat_move_pct:
        return "bearish"
    return "sideways"


def _trend_efficiency(closes: list[float]) -> float:
    if len(closes) < 2:
        return 0.0
    net_move = abs(closes[-1] - closes[0])
    path_move = sum(abs(current - previous) for previous, current in zip(closes[:-1], closes[1:]))
    if path_move == 0:
        return 0.0
    return min(net_move / path_move, 1.0)


def _signed_strength(direction: str, strength: float) -> float | None:
    if direction == "bullish":
        return strength
    if direction == "bearish":
        return -strength
    if direction == "sideways":
        return 0.0
    return None


def _direction_from_score(score: float) -> str:
    if score >= 20:
        return "bullish"
    if score <= -20:
        return "bearish"
    return "sideways"
