from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class Bar:
    symbol: str
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int

    @property
    def value_traded(self) -> float:
        return self.close * self.volume


@dataclass(frozen=True)
class MarketSeries:
    symbol: str
    bars: tuple[Bar, ...]

    @property
    def last(self) -> Bar:
        if not self.bars:
            raise ValueError(f"{self.symbol} has no bars")
        return self.bars[-1]


@dataclass(frozen=True)
class Candidate:
    symbol: str
    score: float
    avg_value_traded: float
    last_close: float
    reasons: tuple[str, ...] = ()
    vetoes: tuple[str, ...] = ()


@dataclass(frozen=True)
class TechnicalView:
    symbol: str
    trend: str
    score: float
    last_close: float
    sma20: float | None
    sma50: float | None
    rsi14: float | None
    atr14: float | None
    support: float | None
    resistance: float | None
    entry: float | None
    stop_loss: float | None
    target1: float | None
    target2: float | None
    reasons: tuple[str, ...] = ()
    vetoes: tuple[str, ...] = ()


@dataclass(frozen=True)
class NewsView:
    symbol: str
    score: float
    risk_level: str
    headlines: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    vetoes: tuple[str, ...] = ()


@dataclass(frozen=True)
class TradeIdea:
    symbol: str
    action: str
    confidence: float
    entry: float | None
    stop_loss: float | None
    target1: float | None
    target2: float | None
    shares: int
    max_position_value: float
    reward_risk: float | None
    reasons: tuple[str, ...] = field(default_factory=tuple)
    vetoes: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class TrendWindow:
    name: str
    direction: str
    strength: float
    return_pct: float | None
    daily_rate_pct: float | None
    volatility_pct: float | None
    start_date: date | None
    end_date: date | None
    bars: int
    note: str = ""


@dataclass(frozen=True)
class TrendProfile:
    symbol: str
    last_close: float
    overall_direction: str
    overall_score: float
    windows: tuple[TrendWindow, ...]


@dataclass(frozen=True)
class IndicatorSnapshot:
    sma20: float | None
    sma50: float | None
    sma200: float | None
    sma20_slope_pct: float | None
    sma50_slope_pct: float | None
    rsi14: float | None
    macd: float | None
    macd_signal: float | None
    macd_histogram: float | None
    adx14: float | None
    plus_di14: float | None
    minus_di14: float | None
    atr14_pct: float | None
    roc20_pct: float | None
    avg_volume20: float | None
    avg_value20: float | None
    relative_volume20: float | None
    active_volume_days20: int
    obv_slope20: float | None
    high_252: float | None
    drawdown_from_high_pct: float | None


@dataclass(frozen=True)
class ConsiderationProfile:
    symbol: str
    verdict: str
    score: float
    last_close: float
    liquidity_score: float
    trend_score: float
    momentum_score: float
    volume_score: float
    risk_score: float
    indicators: IndicatorSnapshot
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    vetoes: tuple[str, ...] = ()


@dataclass(frozen=True)
class Position:
    id: str
    symbol: str
    buy_date: date
    buy_price: float
    quantity: float
    notes: str = ""


@dataclass(frozen=True)
class TradeDecision:
    symbol: str
    action: str
    current_price: float
    suggested_buy_low: float | None
    suggested_buy_high: float | None
    stop_loss: float | None
    target1: float | None
    target2: float | None
    risk_reward: float | None
    support20: float | None
    resistance20: float | None
    atr14: float | None
    already_bought: bool
    buy_date: date | None = None
    buy_price: float | None = None
    quantity: float | None = None
    days_held: int | None = None
    unrealized_pl_pct: float | None = None
    unrealized_pl_value: float | None = None
    reasons: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
