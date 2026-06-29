from __future__ import annotations

from trading_agent.indicators import (
    average_true_range,
    relative_strength_index,
    resistance_level,
    simple_moving_average,
    support_level,
)
from trading_agent.models import MarketSeries, TechnicalView


class TechnicalAgent:
    def analyze(self, series: MarketSeries) -> TechnicalView:
        bars = series.bars
        closes = [bar.close for bar in bars]
        last_close = closes[-1]
        sma20 = simple_moving_average(closes, 20)
        sma50 = simple_moving_average(closes, 50)
        rsi14 = relative_strength_index(closes, 14)
        atr14 = average_true_range(bars, 14)
        support = support_level(bars, 20)
        resistance = resistance_level(bars, 20)

        reasons: list[str] = []
        vetoes: list[str] = []
        score = 0.0

        trend = "mixed"
        if sma20 is not None and last_close > sma20 and (sma50 is None or sma20 > sma50):
            trend = "bullish"
            score += 35
            reasons.append("price is above the 20-day trend")
        elif sma20 is not None and last_close < sma20 and (sma50 is None or sma20 < sma50):
            trend = "bearish"
            vetoes.append("price is below the 20-day trend")
        else:
            score += 10
            reasons.append("trend is mixed")

        if rsi14 is not None:
            if 45 <= rsi14 <= 70:
                score += 25
                reasons.append(f"RSI is constructive at {rsi14:.1f}")
            elif rsi14 > 78:
                vetoes.append(f"RSI is extended at {rsi14:.1f}")
            elif rsi14 < 40:
                vetoes.append(f"RSI is weak at {rsi14:.1f}")

        if atr14 is not None and support is not None:
            distance_to_support = last_close - support
            if distance_to_support > 0:
                score += 20
                reasons.append("price is holding above recent support")
            if distance_to_support < atr14 * 0.5:
                vetoes.append("price is too close to support for a clean stop")

        if resistance is not None and last_close < resistance:
            score += 10
            reasons.append("room remains before recent resistance")

        entry = stop_loss = target1 = target2 = None
        if atr14 is not None:
            entry = round(last_close, 3)
            if support is not None:
                stop_loss = round(min(last_close - atr14 * 1.4, support - atr14 * 0.15), 3)
            else:
                stop_loss = round(last_close - atr14 * 1.5, 3)

            risk_per_share = entry - stop_loss
            if risk_per_share <= 0:
                vetoes.append("stop is not below entry")
            else:
                target1 = round(entry + risk_per_share * 2.0, 3)
                target2 = round(entry + risk_per_share * 3.0, 3)

        if vetoes:
            score *= 0.45

        return TechnicalView(
            symbol=series.symbol,
            trend=trend,
            score=round(min(score, 100), 2),
            last_close=last_close,
            sma20=sma20,
            sma50=sma50,
            rsi14=rsi14,
            atr14=atr14,
            support=support,
            resistance=resistance,
            entry=entry,
            stop_loss=stop_loss,
            target1=target1,
            target2=target2,
            reasons=tuple(reasons),
            vetoes=tuple(vetoes),
        )
