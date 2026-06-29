from __future__ import annotations

from trading_agent.config import RiskConfig
from trading_agent.models import Candidate, NewsView, TechnicalView, TradeIdea
from trading_agent.risk import RiskEngine


class DecisionAgent:
    def __init__(self, risk_config: RiskConfig) -> None:
        self.risk_config = risk_config
        self.risk = RiskEngine(risk_config)

    def decide(self, candidate: Candidate, technical: TechnicalView, news: NewsView) -> TradeIdea:
        confidence = round(candidate.score * 0.35 + technical.score * 0.50 + news.score * 0.15, 2)
        reward_risk = self.risk.reward_risk(technical.entry, technical.stop_loss, technical.target1)
        shares, position_value, sizing_vetoes = self.risk.position_size(technical.entry, technical.stop_loss)

        vetoes = [
            *candidate.vetoes,
            *technical.vetoes,
            *news.vetoes,
            *sizing_vetoes,
        ]
        if reward_risk is None or reward_risk < self.risk_config.min_reward_risk:
            vetoes.append("reward/risk is below the configured minimum")

        if confidence >= 68 and not vetoes:
            action = "paper_buy"
        elif confidence >= 50:
            action = "watch"
        else:
            action = "avoid"

        if self.risk_config.paper_only and action == "paper_buy":
            action = "paper_buy"

        reasons = [
            f"screener score {candidate.score:.1f}",
            f"technical score {technical.score:.1f}",
            f"news score {news.score:.1f}",
            *candidate.reasons,
            *technical.reasons,
            *news.reasons,
        ]

        return TradeIdea(
            symbol=candidate.symbol,
            action=action,
            confidence=confidence,
            entry=technical.entry,
            stop_loss=technical.stop_loss,
            target1=technical.target1,
            target2=technical.target2,
            shares=shares,
            max_position_value=round(position_value, 2),
            reward_risk=round(reward_risk, 2) if reward_risk is not None else None,
            reasons=tuple(reasons),
            vetoes=tuple(dict.fromkeys(vetoes)),
        )
