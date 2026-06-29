from __future__ import annotations

from trading_agent.config import MarketConfig
from trading_agent.models import Candidate, MarketSeries


class ScreenerAgent:
    def __init__(self, config: MarketConfig) -> None:
        self.config = config

    def screen(self, universe: dict[str, MarketSeries]) -> list[Candidate]:
        candidates = [self._score(series) for series in universe.values()]
        candidates.sort(key=lambda item: item.score, reverse=True)
        return candidates

    def _score(self, series: MarketSeries) -> Candidate:
        bars = series.bars
        vetoes: list[str] = []
        reasons: list[str] = []

        if len(bars) < self.config.min_bars:
            vetoes.append(f"only {len(bars)} bars; need {self.config.min_bars}")

        recent = bars[-20:] if len(bars) >= 20 else bars
        avg_value_traded = sum(bar.value_traded for bar in recent) / max(len(recent), 1)
        if avg_value_traded < self.config.min_avg_value_traded:
            vetoes.append(f"average traded value {avg_value_traded:,.0f} below threshold")
        else:
            reasons.append(f"average traded value {avg_value_traded:,.0f}")

        first_close = bars[0].close
        last_close = bars[-1].close
        momentum = (last_close / first_close - 1) * 100
        if momentum > 4:
            reasons.append(f"positive sample momentum {momentum:.1f}%")
        elif momentum < -4:
            vetoes.append(f"negative sample momentum {momentum:.1f}%")

        liquidity_score = min(avg_value_traded / self.config.min_avg_value_traded, 2.0) * 25
        momentum_score = max(min(momentum + 10, 20), 0) * 2.5
        data_score = min(len(bars) / self.config.min_bars, 1.0) * 25
        score = min(liquidity_score + momentum_score + data_score, 100)
        if vetoes:
            score *= 0.35

        return Candidate(
            symbol=series.symbol,
            score=round(score, 2),
            avg_value_traded=avg_value_traded,
            last_close=last_close,
            reasons=tuple(reasons),
            vetoes=tuple(vetoes),
        )
