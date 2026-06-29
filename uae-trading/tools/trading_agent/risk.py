from __future__ import annotations

from math import floor

from trading_agent.config import RiskConfig


class RiskEngine:
    def __init__(self, config: RiskConfig) -> None:
        self.config = config

    def position_size(self, entry: float | None, stop_loss: float | None, cash: float | None = None) -> tuple[int, float, list[str]]:
        available_cash = self.config.cash if cash is None else cash
        vetoes: list[str] = []

        if entry is None or stop_loss is None:
            return 0, 0.0, ["missing entry or stop"]

        risk_per_share = entry - stop_loss
        if risk_per_share <= 0:
            return 0, 0.0, ["risk per share must be positive"]

        max_risk_amount = available_cash * self.config.risk_per_trade_pct
        max_position_value = available_cash * self.config.max_position_pct
        risk_limited_shares = floor(max_risk_amount / risk_per_share)
        value_limited_shares = floor(max_position_value / entry)
        shares = max(0, min(risk_limited_shares, value_limited_shares))
        position_value = shares * entry

        if shares == 0:
            vetoes.append("position size rounds to zero")
        return shares, position_value, vetoes

    def reward_risk(self, entry: float | None, stop_loss: float | None, target: float | None) -> float | None:
        if entry is None or stop_loss is None or target is None:
            return None
        risk = entry - stop_loss
        reward = target - entry
        if risk <= 0:
            return None
        return reward / risk
