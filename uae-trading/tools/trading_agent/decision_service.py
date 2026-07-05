from __future__ import annotations

from trading_agent.indicators import average_true_range, exponential_moving_average, resistance_level, support_level
from trading_agent.market_rules import liquidity_tier_description, round_to_tick, tick_size
from trading_agent.models import ConsiderationProfile, MarketSeries, Position, TradeDecision


def build_trade_decision(
    series: MarketSeries,
    consideration: ConsiderationProfile,
    position: Position | None = None,
) -> TradeDecision:
    closes = [bar.close for bar in series.bars]
    current = series.last.close
    symbol = series.symbol
    atr = average_true_range(series.bars, 14) or max(current * 0.03, 0.001)
    support = support_level(series.bars, 20)
    resistance = resistance_level(series.bars, 20)
    ema20 = consideration.indicators.ema20 or exponential_moving_average(closes, 20)
    ema100 = consideration.indicators.ema100 or exponential_moving_average(closes, 100)
    tier = consideration.liquidity_tier
    setup_type = _setup_type(series, consideration, atr, support, resistance, ema20, ema100, position)
    tick = tick_size(symbol, current)

    buy_low, buy_high = _buy_zone(symbol, current, atr, support, ema20, setup_type, consideration)
    stop_loss, stop_basis = _stop_loss(symbol, current, atr, support, buy_low, setup_type, consideration)
    entry = (buy_low + buy_high) / 2
    risk = max(entry - stop_loss, tick)
    target1 = round_to_tick(symbol, entry + risk, "up")
    target2 = _target2(symbol, entry, risk, resistance, consideration.supply_zone_low)
    if target2 <= target1:
        target2 = round_to_tick(symbol, entry + risk * 2.0, "up")
    trailing_stop = _trailing_stop(symbol, stop_loss, ema20, atr)
    risk_reward = (target2 - entry) / risk if risk > 0 else None
    time_stop_days = _time_stop_days(setup_type)
    setup_grade = _setup_grade(consideration, setup_type, tier, risk_reward)

    reasons: list[str] = []
    warnings: list[str] = []

    if consideration.verdict in {"buy candidate", "setup forming"}:
        reasons.append(f"consideration verdict is {consideration.verdict}")
    elif consideration.verdict == "worth studying":
        warnings.append("setup needs more confirmation before entry")
    else:
        warnings.append(f"consideration verdict is {consideration.verdict}")

    if setup_type == "unqualified":
        warnings.append("no coded UAE setup is confirmed yet")
    elif setup_type == "exit weakness":
        warnings.append("exit weakness pattern is active")
    else:
        reasons.append(f"{setup_type} setup is detected")

    if setup_grade in {"A", "B"}:
        reasons.append(f"setup grade is {setup_grade}")
    else:
        warnings.append(f"setup grade is {setup_grade}")
    if consideration.regime in {"uptrend", "accumulation base"}:
        reasons.append(f"market regime is {consideration.regime}")
    elif consideration.regime in {"downtrend", "distribution"}:
        warnings.append(f"market regime is {consideration.regime}")
    if consideration.location in {"inside demand", "near demand", "lower half of range"}:
        reasons.append(f"price location is {consideration.location}")
    elif consideration.location in {"inside supply", "near supply", "middle of range", "upper half of range"}:
        warnings.append(f"price location is {consideration.location}")

    if tier == "A":
        reasons.append(liquidity_tier_description(tier))
    elif tier == "B":
        warnings.append(liquidity_tier_description(tier))
    else:
        warnings.append(liquidity_tier_description(tier))

    if resistance and resistance > current:
        reasons.append("room remains before recent resistance")
    if consideration.indicators.rsi14 is not None and consideration.indicators.rsi14 >= 75:
        warnings.append(f"RSI is extended at {consideration.indicators.rsi14:.1f}")
    if risk_reward is not None and risk_reward < 1.8:
        warnings.append(f"risk/reward is weak at {risk_reward:.2f}")

    already_bought = position is not None
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
        if trailing_stop is not None and current <= trailing_stop:
            warnings.append("current price is at or below the trailing stop")
        if (
            time_stop_days is not None
            and days_held >= time_stop_days
            and unrealized_pl_pct is not None
            and unrealized_pl_pct < 0
        ):
            warnings.append(f"time stop review after {time_stop_days} days without progress")
        reasons.append(f"already bought on {position.buy_date.isoformat()} at {position.buy_price:.3f}")

    action = _decision_action(
        consideration,
        current,
        buy_high,
        stop_loss,
        trailing_stop,
        target2,
        risk_reward,
        setup_type,
        setup_grade,
        tier,
        time_stop_days,
        days_held,
        unrealized_pl_pct,
        position,
    )

    return TradeDecision(
        symbol=series.symbol,
        action=action,
        setup_type=setup_type,
        liquidity_tier=tier,
        current_price=round_to_tick(symbol, current, "nearest"),
        suggested_buy_low=buy_low,
        suggested_buy_high=buy_high,
        stop_loss=stop_loss,
        trailing_stop=trailing_stop,
        target1=target1,
        target2=target2,
        risk_reward=round(risk_reward, 2) if risk_reward is not None else None,
        stop_basis=stop_basis,
        time_stop_days=time_stop_days,
        tick_size=tick,
        support20=round_to_tick(symbol, support, "nearest") if support is not None else None,
        resistance20=round_to_tick(symbol, resistance, "nearest") if resistance is not None else None,
        atr14=round(atr, 4),
        already_bought=already_bought,
        buy_date=position.buy_date if position else None,
        buy_price=round_to_tick(symbol, position.buy_price, "nearest") if position else None,
        quantity=position.quantity if position else None,
        days_held=days_held,
        unrealized_pl_pct=round(unrealized_pl_pct, 2) if unrealized_pl_pct is not None else None,
        unrealized_pl_value=round(unrealized_pl_value, 2) if unrealized_pl_value is not None else None,
        reasons=tuple(dict.fromkeys(reasons)),
        warnings=tuple(dict.fromkeys(warnings)),
        setup_grade=setup_grade,
        regime=consideration.regime,
        location=consideration.location,
        zone_score=consideration.zone_score,
        location_score=consideration.location_score,
        confluence_score=consideration.confluence_score,
        demand_zone_low=consideration.demand_zone_low,
        demand_zone_high=consideration.demand_zone_high,
        supply_zone_low=consideration.supply_zone_low,
        supply_zone_high=consideration.supply_zone_high,
    )


def trade_decision_to_dict(decision: TradeDecision) -> dict[str, object]:
    return {
        "symbol": decision.symbol,
        "action": decision.action,
        "setup_type": decision.setup_type,
        "setup_grade": decision.setup_grade,
        "liquidity_tier": decision.liquidity_tier,
        "regime": decision.regime,
        "location": decision.location,
        "zone_score": decision.zone_score,
        "location_score": decision.location_score,
        "confluence_score": decision.confluence_score,
        "demand_zone_low": decision.demand_zone_low,
        "demand_zone_high": decision.demand_zone_high,
        "supply_zone_low": decision.supply_zone_low,
        "supply_zone_high": decision.supply_zone_high,
        "current_price": decision.current_price,
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


def _buy_zone(
    symbol: str,
    current: float,
    atr: float,
    support: float | None,
    ema20: float | None,
    setup_type: str,
    consideration: ConsiderationProfile,
) -> tuple[float, float]:
    reference = ema20 if ema20 is not None else current
    if setup_type == "breakout":
        high = current
        low = max(current - atr * 0.75, consideration.demand_zone_low or current - atr * 0.75)
        return _normalized_zone(symbol, low, high, current, atr)

    if consideration.demand_zone_low is not None and consideration.demand_zone_high is not None:
        zone_low = consideration.demand_zone_low
        zone_high = consideration.demand_zone_high
        if setup_type in {"trend pullback", "reversal", "mean reversion"}:
            high = min(max(zone_high + atr * 0.25, zone_low + tick_size(symbol, current)), current)
            low = zone_low
            return _normalized_zone(symbol, low, high, current, atr)

    if setup_type == "continuation":
        high = min(current, reference + atr * 0.35)
        low = max(reference - atr * 0.75, current - atr * 1.1)
        return _normalized_zone(symbol, low, high, current, atr)

    high = min(current, reference + atr * 0.75)
    low_candidates = [current - atr * 1.25]
    if support is not None:
        low_candidates.append(support + atr * 0.25)
    low = max(min(low_candidates), 0.001)
    return _normalized_zone(symbol, low, high, current, atr)


def _stop_loss(
    symbol: str,
    current: float,
    atr: float,
    support: float | None,
    buy_low: float,
    setup_type: str,
    consideration: ConsiderationProfile,
) -> tuple[float, str]:
    multiplier = 0.9 if setup_type in {"mean reversion", "reversal"} else 1.3
    candidates = [buy_low - atr * multiplier, current - atr * 2.2]
    basis = "structure+atr"
    if support is not None:
        candidates.append(support - atr * 0.5)
    if consideration.demand_zone_low is not None:
        candidates.append(consideration.demand_zone_low - atr * 0.55)
        basis = "demand-zone+atr"
    return round_to_tick(symbol, max(min(candidates), 0.001), "down"), basis


def _target2(symbol: str, entry: float, risk: float, resistance: float | None, supply_zone_low: float | None) -> float:
    target = entry + risk * 2.5
    if supply_zone_low is not None and supply_zone_low > entry + risk:
        target = min(target, supply_zone_low)
    if resistance is not None and resistance > entry + risk:
        target = min(target, resistance)
    return round_to_tick(symbol, target, "up")


def _trailing_stop(symbol: str, stop_loss: float, ema20: float | None, atr: float) -> float | None:
    if ema20 is None:
        return stop_loss
    return round_to_tick(symbol, max(stop_loss, ema20 - atr * 0.5), "down")


def _setup_type(
    series: MarketSeries,
    consideration: ConsiderationProfile,
    atr: float,
    support: float | None,
    resistance: float | None,
    ema20: float | None,
    ema100: float | None,
    position: Position | None,
) -> str:
    bars = series.bars
    current = series.last.close
    indicators = consideration.indicators
    adx = indicators.adx14 or 0.0
    rsi = indicators.rsi14
    obv_ok = indicators.obv_slope20 is None or indicators.obv_slope20 >= 0
    trend_up = ema20 is not None and ema100 is not None and current > ema20 > ema100
    directional_up = (
        indicators.plus_di14 is None
        or indicators.minus_di14 is None
        or indicators.plus_di14 >= indicators.minus_di14
    )

    if position and ema20 is not None:
        if current < ema20 and (indicators.macd_histogram or 0) < 0 and (indicators.obv_slope20 or 0) < 0:
            return "exit weakness"

    prior_resistance = _prior_resistance(bars, 20)
    breakout_buffer = max(tick_size(series.symbol, current) * 2, atr * 0.10)
    if (
        trend_up
        and prior_resistance is not None
        and current > prior_resistance + breakout_buffer
        and (indicators.relative_volume20 or 0) >= 1.3
        and obv_ok
    ):
        return "breakout"

    touched_ema = ema20 is not None and any(bar.low <= ema20 + atr * 0.5 for bar in bars[-5:])
    if trend_up and adx >= 18 and directional_up and touched_ema and (rsi is None or rsi >= 40) and obv_ok:
        return "trend pullback"

    near_support = support is not None and current <= support + atr
    near_demand = consideration.location in {"inside demand", "near demand", "lower half of range"}
    if adx < 18 and (near_support or near_demand) and rsi is not None and rsi < 45:
        return "reversal"

    if (
        consideration.regime == "uptrend"
        and current > (ema20 or current)
        and adx >= 18
        and directional_up
        and obv_ok
        and (rsi is None or 48 <= rsi <= 74)
        and (indicators.macd_histogram or 0) >= 0
    ):
        return "continuation"

    if resistance is not None and current >= resistance and (indicators.rsi14 or 0) >= 75:
        return "exit weakness"
    return "unqualified"


def _normalized_zone(symbol: str, low: float, high: float, current: float, atr: float) -> tuple[float, float]:
    tick = tick_size(symbol, current)
    low = max(low, tick)
    high = max(high, low + tick)
    if low >= high:
        low = max(high - max(atr, tick), tick)
    rounded_low = round_to_tick(symbol, low, "down")
    rounded_high = round_to_tick(symbol, high, "up")
    if rounded_low >= rounded_high:
        rounded_low = round_to_tick(symbol, max(rounded_high - max(atr, tick), tick), "down")
    return rounded_low, rounded_high


def _prior_resistance(bars: tuple, period: int) -> float | None:
    if len(bars) < period + 1:
        return None
    return max(bar.high for bar in bars[-period - 1 : -1])


def _time_stop_days(setup_type: str) -> int | None:
    if setup_type == "breakout":
        return 10
    if setup_type in {"mean reversion", "reversal"}:
        return 12
    if setup_type == "continuation":
        return 15
    if setup_type == "trend pullback":
        return 20
    return None


def _setup_grade(
    consideration: ConsiderationProfile,
    setup_type: str,
    tier: str,
    risk_reward: float | None,
) -> str:
    if tier == "C" or setup_type in {"unqualified", "exit weakness"}:
        return "D"

    score = 0.0
    score += min(max(consideration.score, 0), 100) * 0.25
    score += min(max(consideration.location_score, 0), 100) * 0.25
    score += min(max(consideration.confluence_score, 0), 100) * 0.25
    score += min(max(consideration.zone_score / 14 * 100, 0), 100) * 0.15
    if risk_reward is not None:
        if risk_reward >= 2.5:
            score += 10
        elif risk_reward >= 2.0:
            score += 7
        elif risk_reward >= 1.8:
            score += 4
        else:
            score -= 10
    if consideration.regime in {"downtrend", "distribution"}:
        score -= 16
    if consideration.location in {"near supply", "inside supply", "middle of range"}:
        score -= 12
    if tier == "B":
        score -= 8

    if score >= 82:
        return "A"
    if score >= 68:
        return "B"
    if score >= 52:
        return "C"
    return "D"


def _decision_action(
    consideration: ConsiderationProfile,
    current: float,
    buy_high: float,
    stop_loss: float,
    trailing_stop: float | None,
    target2: float,
    risk_reward: float | None,
    setup_type: str,
    setup_grade: str,
    tier: str,
    time_stop_days: int | None,
    days_held: int | None,
    unrealized_pl_pct: float | None,
    position: Position | None,
) -> str:
    if position:
        if current <= stop_loss:
            return "sell"
        if trailing_stop is not None and current <= trailing_stop:
            return "sell"
        if consideration.verdict in {"ignore", "avoid", "sell pressure"}:
            return "sell"
        if setup_type == "exit weakness":
            return "sell"
        if (
            time_stop_days is not None
            and days_held is not None
            and days_held >= time_stop_days
            and unrealized_pl_pct is not None
            and unrealized_pl_pct < 0
        ):
            return "sell"
        if current >= target2:
            return "sell"
        return "hold"

    if tier == "C" or setup_type in {"unqualified", "exit weakness"}:
        return "skip"
    if consideration.verdict in {"ignore", "avoid", "sell pressure", "watch"}:
        return "skip"
    if risk_reward is None or risk_reward < 1.8:
        return "skip"
    if setup_grade == "D":
        return "skip"
    if tier == "B":
        return "watch"
    if setup_grade == "C":
        return "watch"
    if setup_grade == "A" and consideration.verdict == "buy candidate" and current <= buy_high:
        return "buy"
    if consideration.verdict in {"buy candidate", "setup forming", "worth studying"}:
        return "watch"
    return "skip"
