from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP


@dataclass(frozen=True)
class LiquidityTier:
    name: str
    description: str
    min_avg_value: float
    min_active_days: int


LIQUIDITY_TIERS: dict[str, tuple[LiquidityTier, LiquidityTier]] = {
    "ADX": (
        LiquidityTier("A", "intraday and swing eligible", 3_000_000, 18),
        LiquidityTier("B", "swing/watchlist only", 750_000, 14),
    ),
    "DFM": (
        LiquidityTier("A", "intraday and swing eligible", 5_000_000, 18),
        LiquidityTier("B", "swing/watchlist only", 1_250_000, 14),
    ),
}


def market_from_symbol(symbol: str) -> str:
    return symbol.split(":", 1)[0].upper() if ":" in symbol else ""


def liquidity_tier(symbol: str, avg_value: float | None, active_days: int) -> str:
    if avg_value is None or avg_value <= 0:
        return "C"
    tier_a, tier_b = LIQUIDITY_TIERS.get(market_from_symbol(symbol), LIQUIDITY_TIERS["ADX"])
    if avg_value >= tier_a.min_avg_value and active_days >= tier_a.min_active_days:
        return "A"
    if avg_value >= tier_b.min_avg_value and active_days >= tier_b.min_active_days:
        return "B"
    return "C"


def liquidity_tier_description(tier: str) -> str:
    if tier == "A":
        return "Tier A liquidity: intraday and swing eligible"
    if tier == "B":
        return "Tier B liquidity: swing/watchlist only"
    return "Tier C liquidity: avoid automation until liquidity improves"


def tick_size(symbol: str, price: float) -> float:
    market = market_from_symbol(symbol)
    if price < 1:
        return 0.001
    if market == "ADX":
        if price < 10:
            return 0.01
        if price < 50:
            return 0.02
        if price < 100:
            return 0.05
        return 0.10
    if price < 10:
        return 0.01
    return 0.05


def round_to_tick(symbol: str, price: float, mode: str = "nearest") -> float:
    if price <= 0:
        return tick_size(symbol, max(price, 0.001))
    tick = Decimal(str(tick_size(symbol, price)))
    units = Decimal(str(price)) / tick
    if mode == "up":
        rounded_units = units.to_integral_value(rounding=ROUND_CEILING)
    elif mode == "down":
        rounded_units = units.to_integral_value(rounding=ROUND_FLOOR)
    elif mode == "nearest":
        rounded_units = units.to_integral_value(rounding=ROUND_HALF_UP)
    else:
        raise ValueError("mode must be nearest, up, or down")
    rounded = rounded_units * tick
    return float(rounded.quantize(tick))
