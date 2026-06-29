from __future__ import annotations

from datetime import date
from pathlib import Path

from trading_agent.indicators import average_true_range, resistance_level, simple_moving_average, support_level
from trading_agent.models import ConsiderationProfile, MarketSeries, Position, TradeDecision


def build_trade_decision(
    series: MarketSeries,
    consideration: ConsiderationProfile,
    position: Position | None = None,
) -> TradeDecision:
    closes = [bar.close for bar in series.bars]
    current = series.last.close
    atr = average_true_range(series.bars, 14) or max(current * 0.03, 0.001)
    support = support_level(series.bars, 20)
    resistance = resistance_level(series.bars, 20)
    sma20 = simple_moving_average(closes, 20)

    buy_low, buy_high = _buy_zone(current, atr, support, sma20)
    stop_loss = _stop_loss(current, atr, support, buy_low)
    entry = (buy_low + buy_high) / 2
    risk = max(entry - stop_loss, 0.001)
    target1 = _target1(entry, risk, resistance)
    target2 = round(entry + risk * 3.0, 3)
    risk_reward = (target1 - entry) / risk if risk > 0 else None

    reasons: list[str] = []
    warnings: list[str] = []

    if consideration.verdict in {"buy candidate", "setup forming"}:
        reasons.append(f"consideration verdict is {consideration.verdict}")
    elif consideration.verdict == "worth studying":
        warnings.append("setup needs more confirmation before entry")
    else:
        warnings.append(f"consideration verdict is {consideration.verdict}")

    if resistance and resistance > current:
        reasons.append("room remains before recent resistance")
    if consideration.indicators.rsi14 is not None and consideration.indicators.rsi14 >= 75:
        warnings.append(f"RSI is extended at {consideration.indicators.rsi14:.1f}")
    if risk_reward is not None and risk_reward < 1.5:
        warnings.append(f"risk/reward is weak at {risk_reward:.2f}")

    already_bought = position is not None
    action = _decision_action(consideration, current, buy_high, stop_loss, target1, target2, risk_reward, position)
    if already_bought and position:
        reasons.append(f"already bought on {position.buy_date.isoformat()} at {position.buy_price:.3f}")

    days_held = None
    unrealized_pl_pct = None
    unrealized_pl_value = None
    if position:
        days_held = max((series.last.date - position.buy_date).days, 0)
        unrealized_pl_pct = (current / position.buy_price - 1) * 100
        unrealized_pl_value = (current - position.buy_price) * position.quantity
        if current <= stop_loss:
            warnings.append("current price is at or below the calculated stop")
        elif current >= target2:
            warnings.append("second target has been reached")
        elif current >= target1:
            warnings.append("first target has been reached")

    return TradeDecision(
        symbol=series.symbol,
        action=action,
        current_price=round(current, 3),
        suggested_buy_low=round(buy_low, 3),
        suggested_buy_high=round(buy_high, 3),
        stop_loss=round(stop_loss, 3),
        target1=round(target1, 3),
        target2=round(target2, 3),
        risk_reward=round(risk_reward, 2) if risk_reward is not None else None,
        support20=round(support, 3) if support is not None else None,
        resistance20=round(resistance, 3) if resistance is not None else None,
        atr14=round(atr, 3),
        already_bought=already_bought,
        buy_date=position.buy_date if position else None,
        buy_price=round(position.buy_price, 3) if position else None,
        quantity=position.quantity if position else None,
        days_held=days_held,
        unrealized_pl_pct=round(unrealized_pl_pct, 2) if unrealized_pl_pct is not None else None,
        unrealized_pl_value=round(unrealized_pl_value, 2) if unrealized_pl_value is not None else None,
        reasons=tuple(dict.fromkeys(reasons)),
        warnings=tuple(dict.fromkeys(warnings)),
    )


def trade_decision_to_dict(decision: TradeDecision) -> dict[str, object]:
    return {
        "symbol": decision.symbol,
        "action": decision.action,
        "current_price": decision.current_price,
        "suggested_buy_low": decision.suggested_buy_low,
        "suggested_buy_high": decision.suggested_buy_high,
        "stop_loss": decision.stop_loss,
        "target1": decision.target1,
        "target2": decision.target2,
        "risk_reward": decision.risk_reward,
        "support20": decision.support20,
        "resistance20": decision.resistance20,
        "atr14": decision.atr14,
        "already_bought": decision.already_bought,
        "buy_date": decision.buy_date.isoformat() if decision.buy_date else None,
        "buy_price": decision.buy_price,
        "quantity": decision.quantity,
        "days_held": decision.days_held,
        "unrealized_pl_pct": decision.unrealized_pl_pct,
        "unrealized_pl_value": decision.unrealized_pl_value,
        "reasons": list(decision.reasons),
        "warnings": list(decision.warnings),
    }


def _buy_zone(current: float, atr: float, support: float | None, sma20: float | None) -> tuple[float, float]:
    reference = sma20 if sma20 is not None else current
    high = min(current, reference + atr * 0.75)
    low_candidates = [current - atr * 1.25]
    if support is not None:
        low_candidates.append(support + atr * 0.25)
    low = max(min(low_candidates), 0.001)
    if low >= high:
        low = max(high - atr, 0.001)
    return round(low, 3), round(high, 3)


def _stop_loss(current: float, atr: float, support: float | None, buy_low: float) -> float:
    candidates = [buy_low - atr * 1.25, current - atr * 2.2]
    if support is not None:
        candidates.append(support - atr * 0.5)
    return max(min(candidates), 0.001)


def _target1(entry: float, risk: float, resistance: float | None) -> float:
    target = entry + risk * 2.0
    if resistance is not None and resistance > entry and resistance < target:
        return resistance
    return target


def _decision_action(
    consideration: ConsiderationProfile,
    current: float,
    buy_high: float,
    stop_loss: float,
    target1: float,
    target2: float,
    risk_reward: float | None,
    position: Position | None,
) -> str:
    if position:
        if current <= stop_loss:
            return "sell"
        if consideration.verdict in {"ignore", "avoid", "sell pressure"}:
            return "sell"
        if current >= target2:
            return "sell"
        return "hold"

    if consideration.verdict in {"ignore", "avoid", "sell pressure", "watch"}:
        return "skip"
    if risk_reward is None or risk_reward < 1.5:
        return "skip"
    if consideration.verdict == "buy candidate" and current <= buy_high:
        return "buy"
    if consideration.verdict in {"buy candidate", "setup forming", "worth studying"}:
        return "watch"
    return "skip"
