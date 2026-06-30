from __future__ import annotations

from trading_agent.indicators import (
    active_volume_days,
    average_directional_index,
    average_traded_value,
    average_volume,
    exponential_moving_average,
    moving_average_convergence_divergence,
    moving_average_slope_pct,
    normalized_average_true_range_pct,
    on_balance_volume_series,
    rate_of_change_pct,
    relative_strength_index,
    relative_volume,
    series_slope_pct,
    simple_moving_average,
)
from trading_agent.market_rules import liquidity_tier, liquidity_tier_description
from trading_agent.models import ConsiderationProfile, IndicatorSnapshot, MarketSeries, TrendProfile


class ConsiderationAgent:
    def analyze(self, series: MarketSeries, trend: TrendProfile | None = None) -> ConsiderationProfile:
        closes = [bar.close for bar in series.bars]
        indicators = _build_indicators(series)
        reasons: list[str] = []
        warnings: list[str] = []
        vetoes: list[str] = []
        tier = liquidity_tier(series.symbol, indicators.avg_value20, indicators.active_volume_days20)

        liquidity_score = _score_liquidity(series.symbol, indicators, tier, reasons, warnings, vetoes)
        trend_score = _score_trend(series, indicators, trend, reasons, warnings, vetoes)
        momentum_score = _score_momentum(indicators, reasons, warnings, vetoes)
        volume_score = _score_volume(indicators, reasons, warnings, vetoes)
        risk_score = _score_risk(series, indicators, reasons, warnings, vetoes)

        score = (
            liquidity_score * 0.25
            + trend_score * 0.30
            + momentum_score * 0.20
            + volume_score * 0.15
            + risk_score * 0.10
        )

        if indicators.avg_value20 is not None and indicators.avg_value20 < 100_000:
            score = min(score, 45)
        if indicators.active_volume_days20 < 12:
            score = min(score, 55)
        if tier == "B":
            score = min(score, 78)
        if tier == "C":
            score = min(score, 42)
        if trend and trend.overall_direction == "bearish" and trend.overall_score <= -45:
            score = min(score, 45)
        if indicators.rsi14 is not None and indicators.rsi14 >= 82:
            score = min(score, 68)
        if vetoes:
            score = min(score, 40)

        verdict = _verdict(score, indicators, trend, warnings, vetoes)
        return ConsiderationProfile(
            symbol=series.symbol,
            verdict=verdict,
            score=round(score, 1),
            last_close=series.last.close,
            liquidity_tier=tier,
            liquidity_score=round(liquidity_score, 1),
            trend_score=round(trend_score, 1),
            momentum_score=round(momentum_score, 1),
            volume_score=round(volume_score, 1),
            risk_score=round(risk_score, 1),
            indicators=indicators,
            reasons=tuple(dict.fromkeys(reasons)),
            warnings=tuple(dict.fromkeys(warnings)),
            vetoes=tuple(dict.fromkeys(vetoes)),
        )


def _build_indicators(series: MarketSeries) -> IndicatorSnapshot:
    bars = series.bars
    closes = [bar.close for bar in bars]
    macd = moving_average_convergence_divergence(closes)
    adx = average_directional_index(bars)
    obv = on_balance_volume_series(bars)
    high_252 = max(closes[-252:]) if len(closes) >= 20 else None
    drawdown = (series.last.close / high_252 - 1) * 100 if high_252 else None

    return IndicatorSnapshot(
        sma20=simple_moving_average(closes, 20),
        sma50=simple_moving_average(closes, 50),
        sma200=simple_moving_average(closes, 200),
        ema20=exponential_moving_average(closes, 20),
        ema50=exponential_moving_average(closes, 50),
        ema100=exponential_moving_average(closes, 100),
        sma20_slope_pct=moving_average_slope_pct(closes, 20),
        sma50_slope_pct=moving_average_slope_pct(closes, 50),
        rsi14=relative_strength_index(closes, 14),
        macd=macd.macd if macd else None,
        macd_signal=macd.signal if macd else None,
        macd_histogram=macd.histogram if macd else None,
        adx14=adx.adx if adx else None,
        plus_di14=adx.plus_di if adx else None,
        minus_di14=adx.minus_di if adx else None,
        atr14_pct=normalized_average_true_range_pct(bars, 14),
        roc20_pct=rate_of_change_pct(closes, 20),
        avg_volume20=average_volume(bars, 20),
        avg_value20=average_traded_value(bars, 20),
        relative_volume20=relative_volume(bars, 20),
        active_volume_days20=active_volume_days(bars, 20),
        obv_slope20=series_slope_pct(obv, 20),
        high_252=high_252,
        drawdown_from_high_pct=drawdown,
    )


def _score_liquidity(
    symbol: str,
    indicators: IndicatorSnapshot,
    tier: str,
    reasons: list[str],
    warnings: list[str],
    vetoes: list[str],
) -> float:
    avg_value = indicators.avg_value20
    active_days = indicators.active_volume_days20
    if avg_value is None or avg_value <= 0:
        warnings.append("recent volume data is missing")
        return 35

    if tier == "A":
        reasons.append(liquidity_tier_description(tier))
    elif tier == "B":
        warnings.append(liquidity_tier_description(tier))
    else:
        vetoes.append(liquidity_tier_description(tier))

    if symbol.startswith("DFM:") and avg_value < 1_250_000:
        score = 25
        vetoes.append(f"DFM traded value is below the Tier B threshold at {avg_value:,.0f}")
    elif avg_value >= 5_000_000:
        score = 100
        reasons.append(f"20-day traded value is strong at {avg_value:,.0f}")
    elif avg_value >= 2_000_000:
        score = 85
        reasons.append(f"20-day traded value is good at {avg_value:,.0f}")
    elif avg_value >= 750_000:
        score = 68
        reasons.append(f"20-day traded value is acceptable at {avg_value:,.0f}")
    elif avg_value >= 250_000:
        score = 45
        warnings.append(f"20-day traded value is thin at {avg_value:,.0f}")
    else:
        score = 20
        vetoes.append(f"20-day traded value is too low at {avg_value:,.0f}")

    if active_days >= 18:
        score += 5
    elif active_days < 12:
        score -= 25
        warnings.append(f"only {active_days} active volume days in the last 20")
    return _clamp(score)


def _score_trend(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    trend: TrendProfile | None,
    reasons: list[str],
    warnings: list[str],
    vetoes: list[str],
) -> float:
    close = series.last.close
    score = 0.0
    if indicators.sma20 and close > indicators.sma20:
        score += 15
    if indicators.sma50 and close > indicators.sma50:
        score += 20
        reasons.append("price is above the 50-day average")
    elif indicators.sma50:
        warnings.append("price is below the 50-day average")
    if indicators.sma200 and close > indicators.sma200:
        score += 20
    elif indicators.sma200:
        warnings.append("price is below the 200-day average")

    if indicators.sma20 and indicators.sma50 and indicators.sma20 > indicators.sma50:
        score += 15
        reasons.append("short trend is above intermediate trend")
    if indicators.sma50 and indicators.sma200 and indicators.sma50 > indicators.sma200:
        score += 10
    if indicators.sma20_slope_pct is not None and indicators.sma20_slope_pct > 0:
        score += 8
    if indicators.sma50_slope_pct is not None and indicators.sma50_slope_pct > 0:
        score += 7

    if trend:
        if trend.overall_direction == "bullish":
            score += min(max(trend.overall_score, 0), 100) * 0.15
            reasons.append(f"multi-window trend is bullish at {trend.overall_score:.1f}")
        elif trend.overall_direction == "bearish":
            warnings.append(f"multi-window trend is bearish at {trend.overall_score:.1f}")

    if indicators.adx14 is not None:
        if indicators.adx14 >= 20:
            score += 5
            if indicators.plus_di14 is not None and indicators.minus_di14 is not None and indicators.plus_di14 > indicators.minus_di14:
                score += 10
                reasons.append(f"ADX confirms an upward trend at {indicators.adx14:.1f}")
            elif indicators.minus_di14 is not None and indicators.plus_di14 is not None:
                warnings.append(f"ADX trend strength favors sellers at {indicators.adx14:.1f}")
        else:
            warnings.append(f"ADX is weak at {indicators.adx14:.1f}")

    if trend and trend.overall_direction == "bearish" and indicators.sma50 and close < indicators.sma50:
        vetoes.append("bearish trend and price below the 50-day average")
    return _clamp(score)


def _score_momentum(
    indicators: IndicatorSnapshot,
    reasons: list[str],
    warnings: list[str],
    vetoes: list[str],
) -> float:
    score = 40.0
    rsi = indicators.rsi14
    if rsi is not None:
        if 50 <= rsi <= 68:
            score += 35
            reasons.append(f"RSI is healthy at {rsi:.1f}")
        elif 45 <= rsi < 50 or 68 < rsi <= 75:
            score += 20
            warnings.append(f"RSI is acceptable but watch it at {rsi:.1f}")
        elif 75 < rsi < 82:
            score += 5
            warnings.append(f"RSI is extended at {rsi:.1f}")
        elif rsi >= 82:
            warnings.append(f"RSI is overheated at {rsi:.1f}")
        elif rsi < 40:
            score -= 20
            warnings.append(f"RSI is weak at {rsi:.1f}")

    if indicators.macd_histogram is not None:
        if indicators.macd_histogram > 0 and indicators.macd is not None and indicators.macd > 0:
            score += 20
            reasons.append("MACD momentum is positive")
        elif indicators.macd_histogram > 0:
            score += 10
        else:
            score -= 10
            warnings.append("MACD momentum is negative")

    if indicators.roc20_pct is not None:
        if indicators.roc20_pct > 4:
            score += 10
        elif indicators.roc20_pct < -4:
            score -= 15
            warnings.append(f"20-day momentum is negative at {indicators.roc20_pct:.1f}%")
    if rsi is not None and rsi < 35 and indicators.roc20_pct is not None and indicators.roc20_pct < -8:
        vetoes.append("momentum is deeply negative")
    return _clamp(score)


def _score_volume(
    indicators: IndicatorSnapshot,
    reasons: list[str],
    warnings: list[str],
    vetoes: list[str],
) -> float:
    if indicators.avg_volume20 is None or indicators.avg_volume20 <= 0:
        warnings.append("volume confirmation unavailable")
        return 35

    score = 45.0
    relative = indicators.relative_volume20
    if relative is not None:
        if relative >= 1.5:
            score += 25
            reasons.append(f"relative volume is elevated at {relative:.2f}x")
        elif relative >= 0.8:
            score += 12
        elif relative < 0.5:
            score -= 15
            warnings.append(f"relative volume is light at {relative:.2f}x")

    if indicators.obv_slope20 is not None:
        if indicators.obv_slope20 > 10:
            score += 25
            reasons.append("OBV confirms accumulation")
        elif indicators.obv_slope20 > 0:
            score += 12
        elif indicators.obv_slope20 < -10:
            score -= 20
            warnings.append("OBV shows distribution pressure")

    if indicators.active_volume_days20 < 10:
        vetoes.append("too few recent active volume days")
    return _clamp(score)


def _score_risk(
    series: MarketSeries,
    indicators: IndicatorSnapshot,
    reasons: list[str],
    warnings: list[str],
    vetoes: list[str],
) -> float:
    score = 70.0
    atr_pct = indicators.atr14_pct
    if atr_pct is None:
        warnings.append("ATR risk estimate unavailable")
        score -= 10
    elif 1 <= atr_pct <= 6:
        score += 15
        reasons.append(f"ATR risk is manageable at {atr_pct:.1f}%")
    elif 6 < atr_pct <= 10:
        score -= 5
        warnings.append(f"ATR risk is elevated at {atr_pct:.1f}%")
    elif atr_pct > 10:
        score -= 25
        warnings.append(f"ATR risk is high at {atr_pct:.1f}%")

    close = series.last.close
    if indicators.sma20:
        extension = (close / indicators.sma20 - 1) * 100
        if extension > 14:
            score -= 20
            warnings.append(f"price is stretched {extension:.1f}% above the 20-day average")
        elif extension < -8:
            score -= 10

    if indicators.drawdown_from_high_pct is not None:
        if indicators.drawdown_from_high_pct < -45:
            score -= 20
            warnings.append(f"stock is {abs(indicators.drawdown_from_high_pct):.1f}% below its 252-day high")
        elif indicators.drawdown_from_high_pct > -12:
            score += 5

    if close < 0.10:
        vetoes.append("price is below 0.10 and may be structurally risky")
    return _clamp(score)


def _verdict(
    score: float,
    indicators: IndicatorSnapshot,
    trend: TrendProfile | None,
    warnings: list[str],
    vetoes: list[str],
) -> str:
    if vetoes:
        return "ignore"
    if trend and trend.overall_direction == "bearish" and trend.overall_score <= -45:
        return "sell pressure"
    if indicators.sma50 is not None and indicators.sma200 is not None:
        if indicators.sma50 < indicators.sma200 and score < 55:
            return "avoid"

    critical_warning = any(
        warning.startswith(
            (
                "price is below the 200-day average",
                "MACD momentum is negative",
                "relative volume is light",
                "RSI is extended",
                "RSI is overheated",
                "ADX trend strength favors sellers",
            )
        )
        for warning in warnings
    )
    if score >= 82 and not critical_warning:
        return "buy candidate"
    if score >= 70:
        return "setup forming"
    if score >= 58:
        return "worth studying"
    if score >= 45:
        return "watch"
    return "ignore"


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(value, high))
