from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from trading_agent.indicators import average_true_range
from trading_agent.market_rules import round_to_tick, tick_size
from trading_agent.models import Bar, IndicatorSnapshot, MarketSeries, TrendProfile


@dataclass(frozen=True)
class PriceZone:
    kind: str
    low: float
    high: float
    midpoint: float
    score: float
    touches: int
    last_touch_date: date | None
    reasons: tuple[str, ...] = ()


@dataclass(frozen=True)
class MarketStructureSnapshot:
    regime: str
    regime_score: float
    location: str
    location_score: float
    zone_score: float
    confluence_score: float
    demand_zone: PriceZone | None
    supply_zone: PriceZone | None
    pivot_zone: PriceZone | None
    fib_382: float | None
    fib_500: float | None
    fib_618: float | None
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class _PricePoint:
    price: float
    index: int
    date: date
    volume: int


def analyze_market_structure(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    trend: TrendProfile | None = None,
) -> MarketStructureSnapshot:
    bars = series.bars
    current = series.last.close
    atr = average_true_range(bars, 14) or max(current * 0.025, tick_size(series.symbol, current) * 4)
    buffer = _zone_buffer(series.symbol, current, atr)
    fib_levels = _fib_levels(bars)
    demand_zones, supply_zones = _build_zones(series, indicators, atr, buffer, fib_levels)
    demand_zone = _select_demand_zone(demand_zones, current, atr)
    supply_zone = _select_supply_zone(supply_zones, current, atr)
    pivot_zone = _pivot_zone(current, atr, demand_zone, supply_zone)
    regime, regime_score, regime_reasons, regime_warnings = _classify_regime(series, indicators, trend)
    location, location_score, location_reasons, location_warnings = _classify_location(
        current,
        atr,
        demand_zone,
        supply_zone,
        regime,
    )
    zone_score = pivot_zone.score if pivot_zone else max(
        demand_zone.score if demand_zone else 0.0,
        supply_zone.score if supply_zone else 0.0,
    )
    confluence_score, confluence_reasons, confluence_warnings = _confluence_score(
        series,
        indicators,
        current,
        atr,
        pivot_zone or demand_zone,
        fib_levels,
        regime,
        location,
    )

    return MarketStructureSnapshot(
        regime=regime,
        regime_score=round(regime_score, 1),
        location=location,
        location_score=round(location_score, 1),
        zone_score=round(zone_score, 1),
        confluence_score=round(confluence_score, 1),
        demand_zone=demand_zone,
        supply_zone=supply_zone,
        pivot_zone=pivot_zone,
        fib_382=_round_price(series.symbol, fib_levels.get("38.2")),
        fib_500=_round_price(series.symbol, fib_levels.get("50.0")),
        fib_618=_round_price(series.symbol, fib_levels.get("61.8")),
        reasons=tuple(dict.fromkeys((*regime_reasons, *location_reasons, *confluence_reasons))),
        warnings=tuple(dict.fromkeys((*regime_warnings, *location_warnings, *confluence_warnings))),
    )


def _build_zones(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    atr: float,
    buffer: float,
    fib_levels: dict[str, float],
) -> tuple[list[PriceZone], list[PriceZone]]:
    bars = series.bars[-252:] if len(series.bars) > 252 else series.bars
    offset = len(series.bars) - len(bars)
    lows, highs = _pivot_points(bars, offset)
    lows.extend(_fallback_points(series.bars, "low"))
    highs.extend(_fallback_points(series.bars, "high"))
    demand_zones = _cluster_points(series.symbol, "demand", lows, series.bars, indicators, atr, buffer, fib_levels)
    supply_zones = _cluster_points(series.symbol, "supply", highs, series.bars, indicators, atr, buffer, fib_levels)
    return demand_zones, supply_zones


def _pivot_points(bars: tuple[Bar, ...], offset: int, wing: int = 3) -> tuple[list[_PricePoint], list[_PricePoint]]:
    lows: list[_PricePoint] = []
    highs: list[_PricePoint] = []
    if len(bars) < wing * 2 + 1:
        return lows, highs

    for local_index in range(wing, len(bars) - wing):
        window = bars[local_index - wing : local_index + wing + 1]
        center = bars[local_index]
        if center.low <= min(bar.low for bar in window):
            lows.append(_PricePoint(center.low, offset + local_index, center.date, center.volume))
        if center.high >= max(bar.high for bar in window):
            highs.append(_PricePoint(center.high, offset + local_index, center.date, center.volume))
    return lows, highs


def _fallback_points(bars: tuple[Bar, ...], side: str) -> list[_PricePoint]:
    points: list[_PricePoint] = []
    for period in (20, 60, 120):
        if len(bars) < period:
            continue
        start = len(bars) - period
        recent = list(enumerate(bars[-period:], start=start))
        if side == "low":
            index, bar = min(recent, key=lambda item: item[1].low)
            price = bar.low
        else:
            index, bar = max(recent, key=lambda item: item[1].high)
            price = bar.high
        points.append(_PricePoint(price, index, bar.date, bar.volume))
    return points


def _cluster_points(
    symbol: str,
    kind: str,
    points: list[_PricePoint],
    bars: tuple[Bar, ...],
    indicators: IndicatorSnapshot,
    atr: float,
    buffer: float,
    fib_levels: dict[str, float],
) -> list[PriceZone]:
    clusters: list[list[_PricePoint]] = []
    for point in sorted(points, key=lambda item: item.price):
        for cluster in clusters:
            midpoint = sum(item.price for item in cluster) / len(cluster)
            if abs(point.price - midpoint) <= buffer:
                cluster.append(point)
                break
        else:
            clusters.append([point])

    zones = [
        _zone_from_cluster(symbol, kind, cluster, bars, indicators, atr, buffer, fib_levels)
        for cluster in clusters
        if cluster
    ]
    return sorted(zones, key=lambda zone: (zone.score, zone.touches), reverse=True)


def _zone_from_cluster(
    symbol: str,
    kind: str,
    cluster: list[_PricePoint],
    bars: tuple[Bar, ...],
    indicators: IndicatorSnapshot,
    atr: float,
    buffer: float,
    fib_levels: dict[str, float],
) -> PriceZone:
    prices = [point.price for point in cluster]
    midpoint = sum(prices) / len(prices)
    low = max(min(prices) - buffer * 0.5, tick_size(symbol, midpoint))
    high = max(prices) + buffer * 0.5
    touches = len(cluster)
    last_touch = max(point.date for point in cluster)
    days_since_touch = (bars[-1].date - last_touch).days
    score = 0.0
    reasons: list[str] = []

    score += 2 if len(bars) >= 160 else 1
    if len(bars) >= 160:
        reasons.append("zone is built from a multi-month daily lookback")
    score += min(touches, 3)
    if touches >= 2:
        reasons.append(f"{touches} reactions found near the zone")
    if days_since_touch <= 30:
        score += 2
        reasons.append("recent reaction keeps the zone fresh")
    elif days_since_touch <= 90:
        score += 1

    reaction_score = _reaction_score(kind, cluster, bars, atr)
    score += reaction_score
    if reaction_score >= 2:
        reasons.append("price reacted cleanly after touching the zone")

    volume_score = _zone_volume_score(cluster, indicators)
    score += volume_score
    if volume_score >= 1:
        reasons.append("touches had acceptable volume participation")

    confluence_score = _zone_confluence_score(midpoint, indicators, fib_levels, buffer)
    score += confluence_score
    if confluence_score:
        reasons.append("zone overlaps a moving-average or Fibonacci area")

    score = min(score, 14.0)
    return PriceZone(
        kind=kind,
        low=round_to_tick(symbol, low, "down"),
        high=round_to_tick(symbol, high, "up"),
        midpoint=round_to_tick(symbol, midpoint, "nearest"),
        score=round(score, 1),
        touches=touches,
        last_touch_date=last_touch,
        reasons=tuple(dict.fromkeys(reasons)),
    )


def _reaction_score(kind: str, cluster: list[_PricePoint], bars: tuple[Bar, ...], atr: float) -> float:
    if atr <= 0:
        return 0.0
    reactions = []
    for point in cluster:
        future = bars[point.index + 1 : point.index + 11]
        if not future:
            continue
        if kind == "demand":
            reactions.append((max(bar.high for bar in future) - point.price) / atr)
        else:
            reactions.append((point.price - min(bar.low for bar in future)) / atr)
    if not reactions:
        return 0.0
    average = sum(max(value, 0.0) for value in reactions) / len(reactions)
    if average >= 2.0:
        return 3.0
    if average >= 1.0:
        return 2.0
    if average >= 0.5:
        return 1.0
    return 0.0


def _zone_volume_score(cluster: list[_PricePoint], indicators: IndicatorSnapshot) -> float:
    if indicators.avg_volume20 is None or indicators.avg_volume20 <= 0:
        return 0.0
    average_touch_volume = sum(point.volume for point in cluster) / len(cluster)
    if average_touch_volume >= indicators.avg_volume20 * 1.2:
        return 2.0
    if average_touch_volume >= indicators.avg_volume20 * 0.75:
        return 1.0
    return 0.0


def _zone_confluence_score(
    price: float,
    indicators: IndicatorSnapshot,
    fib_levels: dict[str, float],
    buffer: float,
) -> float:
    score = 0.0
    averages = [indicators.ema20, indicators.ema50, indicators.ema100, indicators.sma50, indicators.sma200]
    if any(value is not None and abs(price - value) <= buffer * 1.5 for value in averages):
        score += 1
    if any(abs(price - value) <= buffer * 1.5 for value in fib_levels.values()):
        score += 1
    return score


def _classify_regime(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    trend: TrendProfile | None,
) -> tuple[str, float, tuple[str, ...], tuple[str, ...]]:
    close = series.last.close
    reasons: list[str] = []
    warnings: list[str] = []
    ema20 = indicators.ema20
    ema50 = indicators.ema50
    ema100 = indicators.ema100
    adx = indicators.adx14 or 0.0
    plus_di = indicators.plus_di14
    minus_di = indicators.minus_di14
    macd_histogram = indicators.macd_histogram or 0.0
    obv_slope = indicators.obv_slope20 or 0.0
    slope20 = indicators.sma20_slope_pct or 0.0
    slope50 = indicators.sma50_slope_pct or 0.0
    drawdown = indicators.drawdown_from_high_pct
    range_pct = _recent_range_pct(series.bars, 60)

    stacked_up = bool(ema20 and ema50 and ema100 and close > ema20 > ema50 > ema100)
    stacked_down = bool(ema20 and ema50 and close < ema20 < ema50)
    directional_up = plus_di is None or minus_di is None or plus_di >= minus_di
    directional_down = plus_di is not None and minus_di is not None and minus_di > plus_di

    if (
        drawdown is not None
        and drawdown > -14
        and obv_slope < -5
        and macd_histogram < 0
        and ema20 is not None
        and close < ema20
    ):
        warnings.append("near highs but volume/momentum are deteriorating")
        return "distribution", 78.0, tuple(reasons), tuple(warnings)

    if stacked_up and slope20 >= 0 and slope50 >= 0 and directional_up:
        score = 72 + min(adx, 35) * 0.6
        if trend and trend.overall_direction == "bullish":
            score += 6
        reasons.append("price is above aligned rising averages")
        return "uptrend", min(score, 96.0), tuple(reasons), tuple(warnings)

    if stacked_down and slope20 <= 0 and directional_down:
        score = 72 + min(adx, 35) * 0.5
        warnings.append("price is below falling short/intermediate averages")
        return "downtrend", min(score, 94.0), tuple(reasons), tuple(warnings)

    if (
        drawdown is not None
        and drawdown < -18
        and adx < 22
        and range_pct is not None
        and range_pct <= 22
        and slope20 >= -1.5
    ):
        reasons.append("volatility is compressing after a larger drawdown")
        return "accumulation base", 68.0, tuple(reasons), tuple(warnings)

    if adx < 18 or (range_pct is not None and range_pct <= 18):
        warnings.append("trend strength is limited, so range rules matter more")
        return "range", 62.0, tuple(reasons), tuple(warnings)

    warnings.append("market structure is mixed across trend measures")
    return "mixed", 48.0, tuple(reasons), tuple(warnings)


def _classify_location(
    current: float,
    atr: float,
    demand_zone: PriceZone | None,
    supply_zone: PriceZone | None,
    regime: str,
) -> tuple[str, float, tuple[str, ...], tuple[str, ...]]:
    reasons: list[str] = []
    warnings: list[str] = []
    near_buffer = max(atr * 0.6, current * 0.012)

    if demand_zone and demand_zone.low <= current <= demand_zone.high:
        reasons.append("price is inside a demand/support zone")
        return "inside demand", 92.0, tuple(reasons), tuple(warnings)
    if demand_zone and current <= demand_zone.high + near_buffer:
        score = 82.0 if regime in {"uptrend", "accumulation base", "range"} else 64.0
        reasons.append("price is near a demand/support zone")
        return "near demand", score, tuple(reasons), tuple(warnings)

    if supply_zone and supply_zone.low <= current <= supply_zone.high:
        warnings.append("price is inside a supply/resistance zone")
        return "inside supply", 18.0, tuple(reasons), tuple(warnings)
    if supply_zone and current >= supply_zone.low - near_buffer:
        warnings.append("price is close to supply/resistance")
        return "near supply", 25.0, tuple(reasons), tuple(warnings)

    if demand_zone and supply_zone and supply_zone.midpoint > demand_zone.midpoint:
        position = (current - demand_zone.midpoint) / (supply_zone.midpoint - demand_zone.midpoint)
        if 0.35 <= position <= 0.65:
            warnings.append("price is in the middle of the current structure")
            return "middle of range", 42.0, tuple(reasons), tuple(warnings)
        if position < 0.35:
            return "lower half of range", 62.0, tuple(reasons), tuple(warnings)
        warnings.append("price is in the upper half of the current structure")
        return "upper half of range", 38.0, tuple(reasons), tuple(warnings)

    if regime == "uptrend":
        reasons.append("price is in trend context but not at a fresh zone")
        return "trend continuation area", 58.0, tuple(reasons), tuple(warnings)

    warnings.append("nearest support/resistance zones are unclear")
    return "structure unclear", 42.0, tuple(reasons), tuple(warnings)


def _confluence_score(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    current: float,
    atr: float,
    zone: PriceZone | None,
    fib_levels: dict[str, float],
    regime: str,
    location: str,
) -> tuple[float, tuple[str, ...], tuple[str, ...]]:
    reasons: list[str] = []
    warnings: list[str] = []
    score = 0.0
    if zone:
        score += zone.score / 14 * 35
        if zone.score >= 8:
            reasons.append(f"{zone.kind} zone quality is {zone.score:.1f}/14")
    else:
        warnings.append("no high-quality nearby zone was detected")

    if _near_any_average(current, indicators, atr):
        score += 12
        reasons.append("price is close to a key moving average")
    if any(abs(current - level) <= max(atr * 0.5, current * 0.01) for level in fib_levels.values()):
        score += 8
        reasons.append("price is near a Fibonacci retracement area")
    if _near_round_level(series.symbol, current, atr):
        score += 5
        reasons.append("price is close to a round/tick-aware level")

    if regime in {"uptrend", "accumulation base"}:
        score += 12
    elif regime in {"downtrend", "distribution"}:
        score -= 12
        warnings.append(f"{regime} regime reduces buy-side confluence")

    if location in {"inside demand", "near demand", "lower half of range", "trend continuation area"}:
        score += 14
    elif location in {"near supply", "inside supply", "upper half of range", "middle of range"}:
        score -= 10

    if indicators.relative_volume20 is not None and indicators.relative_volume20 >= 1.2:
        score += 8
        reasons.append("recent volume is above normal")
    if indicators.obv_slope20 is not None and indicators.obv_slope20 > 0:
        score += 8
        reasons.append("OBV slope supports accumulation")
    if indicators.rsi14 is not None and 45 <= indicators.rsi14 <= 70:
        score += 6
    elif indicators.rsi14 is not None and indicators.rsi14 >= 78:
        score -= 8
        warnings.append("RSI is extended for a fresh entry")
    if indicators.macd_histogram is not None and indicators.macd_histogram > 0:
        score += 5

    return max(0.0, min(round(score, 1), 100.0)), tuple(dict.fromkeys(reasons)), tuple(dict.fromkeys(warnings))


def _select_demand_zone(zones: list[PriceZone], current: float, atr: float) -> PriceZone | None:
    candidates = [zone for zone in zones if zone.low <= current + atr * 0.7]
    if not candidates:
        return None
    return max(candidates, key=lambda zone: (zone.score - max(current - zone.midpoint, 0) / max(atr, 0.001), zone.score))


def _select_supply_zone(zones: list[PriceZone], current: float, atr: float) -> PriceZone | None:
    candidates = [zone for zone in zones if zone.high >= current - atr * 0.7]
    if not candidates:
        return None
    return max(candidates, key=lambda zone: (zone.score - max(zone.midpoint - current, 0) / max(atr, 0.001), zone.score))


def _pivot_zone(
    current: float,
    atr: float,
    demand_zone: PriceZone | None,
    supply_zone: PriceZone | None,
) -> PriceZone | None:
    zones = [zone for zone in (demand_zone, supply_zone) if zone is not None]
    if not zones:
        return None
    return min(zones, key=lambda zone: _zone_distance(current, atr, zone))


def _zone_distance(current: float, atr: float, zone: PriceZone) -> float:
    if zone.low <= current <= zone.high:
        return 0.0
    if current < zone.low:
        return (zone.low - current) / max(atr, 0.001)
    return (current - zone.high) / max(atr, 0.001)


def _fib_levels(bars: tuple[Bar, ...]) -> dict[str, float]:
    recent = bars[-252:] if len(bars) > 252 else bars
    if len(recent) < 30:
        return {}
    swing_high = max(bar.high for bar in recent)
    swing_low = min(bar.low for bar in recent)
    price_range = swing_high - swing_low
    if price_range <= 0:
        return {}
    return {
        "38.2": swing_high - price_range * 0.382,
        "50.0": swing_high - price_range * 0.500,
        "61.8": swing_high - price_range * 0.618,
    }


def _recent_range_pct(bars: tuple[Bar, ...], period: int) -> float | None:
    if len(bars) < period:
        return None
    recent = bars[-period:]
    low = min(bar.low for bar in recent)
    high = max(bar.high for bar in recent)
    if bars[-1].close <= 0:
        return None
    return (high - low) / bars[-1].close * 100


def _near_any_average(current: float, indicators: IndicatorSnapshot, atr: float) -> bool:
    buffer = max(atr * 0.5, current * 0.01)
    return any(
        value is not None and abs(current - value) <= buffer
        for value in (indicators.ema20, indicators.ema50, indicators.ema100, indicators.sma50, indicators.sma200)
    )


def _near_round_level(symbol: str, current: float, atr: float) -> bool:
    tick = tick_size(symbol, current)
    if current < 1:
        step = max(tick * 50, 0.05)
    elif current < 10:
        step = 0.10
    elif current < 50:
        step = 0.50
    else:
        step = 1.0
    nearest = round(current / step) * step
    return abs(current - nearest) <= max(atr * 0.35, tick * 2)


def _zone_buffer(symbol: str, current: float, atr: float) -> float:
    return max(current * 0.0075, atr * 0.35, tick_size(symbol, current) * 2)


def _round_price(symbol: str, value: float | None) -> float | None:
    if value is None:
        return None
    return round_to_tick(symbol, value, "nearest")
