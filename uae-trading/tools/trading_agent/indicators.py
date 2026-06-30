from __future__ import annotations

from dataclasses import dataclass

from trading_agent.models import Bar


@dataclass(frozen=True)
class MacdValue:
    macd: float
    signal: float
    histogram: float


@dataclass(frozen=True)
class AdxValue:
    adx: float
    plus_di: float
    minus_di: float


def simple_moving_average(values: list[float], period: int) -> float | None:
    if period <= 0:
        raise ValueError("period must be positive")
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def moving_average_slope_pct(values: list[float], period: int, lookback: int = 5) -> float | None:
    if len(values) < period + lookback:
        return None
    current = simple_moving_average(values, period)
    prior = sum(values[-period - lookback : -lookback]) / period
    if current is None or prior == 0:
        return None
    return (current / prior - 1) * 100


def exponential_moving_average_series(values: list[float], period: int) -> list[float]:
    if period <= 0:
        raise ValueError("period must be positive")
    if not values:
        return []
    alpha = 2 / (period + 1)
    series = [values[0]]
    for value in values[1:]:
        series.append((value - series[-1]) * alpha + series[-1])
    return series


def exponential_moving_average(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return exponential_moving_average_series(values, period)[-1]


def moving_average_convergence_divergence(
    closes: list[float],
    fast_period: int = 12,
    slow_period: int = 26,
    signal_period: int = 9,
) -> MacdValue | None:
    if len(closes) < slow_period + signal_period:
        return None
    fast = exponential_moving_average_series(closes, fast_period)
    slow = exponential_moving_average_series(closes, slow_period)
    macd_line = [fast_value - slow_value for fast_value, slow_value in zip(fast, slow)]
    signal = exponential_moving_average_series(macd_line, signal_period)
    return MacdValue(
        macd=macd_line[-1],
        signal=signal[-1],
        histogram=macd_line[-1] - signal[-1],
    )


def relative_strength_index(closes: list[float], period: int = 14) -> float | None:
    if len(closes) <= period:
        return None

    gains: list[float] = []
    losses: list[float] = []
    for previous, current in zip(closes[-period - 1 : -1], closes[-period:]):
        change = current - previous
        gains.append(max(change, 0.0))
        losses.append(abs(min(change, 0.0)))

    average_gain = sum(gains) / period
    average_loss = sum(losses) / period
    if average_loss == 0:
        return 100.0
    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def average_true_range(bars: tuple[Bar, ...], period: int = 14) -> float | None:
    if len(bars) <= period:
        return None

    true_ranges: list[float] = []
    for previous, current in zip(bars[-period - 1 : -1], bars[-period:]):
        true_ranges.append(
            max(
                current.high - current.low,
                abs(current.high - previous.close),
                abs(current.low - previous.close),
            )
        )
    return sum(true_ranges) / period


def normalized_average_true_range_pct(bars: tuple[Bar, ...], period: int = 14) -> float | None:
    atr = average_true_range(bars, period)
    if atr is None or not bars or bars[-1].close == 0:
        return None
    return atr / bars[-1].close * 100


def average_directional_index(bars: tuple[Bar, ...], period: int = 14) -> AdxValue | None:
    if len(bars) < period * 2 + 1:
        return None

    true_ranges: list[float] = []
    plus_dm: list[float] = []
    minus_dm: list[float] = []
    for previous, current in zip(bars[:-1], bars[1:]):
        up_move = current.high - previous.high
        down_move = previous.low - current.low
        plus_dm.append(up_move if up_move > down_move and up_move > 0 else 0.0)
        minus_dm.append(down_move if down_move > up_move and down_move > 0 else 0.0)
        true_ranges.append(
            max(
                current.high - current.low,
                abs(current.high - previous.close),
                abs(current.low - previous.close),
            )
        )

    tr14 = sum(true_ranges[:period])
    plus14 = sum(plus_dm[:period])
    minus14 = sum(minus_dm[:period])
    dx_values: list[float] = []

    for index in range(period, len(true_ranges)):
        tr14 = tr14 - (tr14 / period) + true_ranges[index]
        plus14 = plus14 - (plus14 / period) + plus_dm[index]
        minus14 = minus14 - (minus14 / period) + minus_dm[index]
        if tr14 == 0:
            continue
        plus_di = 100 * (plus14 / tr14)
        minus_di = 100 * (minus14 / tr14)
        denominator = plus_di + minus_di
        if denominator == 0:
            continue
        dx_values.append(100 * abs(plus_di - minus_di) / denominator)

    if len(dx_values) < period:
        return None

    adx = sum(dx_values[:period]) / period
    for dx in dx_values[period:]:
        adx = ((adx * (period - 1)) + dx) / period

    if tr14 == 0:
        return None
    plus_di = 100 * (plus14 / tr14)
    minus_di = 100 * (minus14 / tr14)
    return AdxValue(adx=adx, plus_di=plus_di, minus_di=minus_di)


def support_level(bars: tuple[Bar, ...], period: int = 20) -> float | None:
    if len(bars) < period:
        return None
    return min(bar.low for bar in bars[-period:])


def resistance_level(bars: tuple[Bar, ...], period: int = 20) -> float | None:
    if len(bars) < period:
        return None
    return max(bar.high for bar in bars[-period:])


def rate_of_change_pct(values: list[float], period: int = 20) -> float | None:
    if len(values) <= period:
        return None
    previous = values[-period - 1]
    if previous == 0:
        return None
    return (values[-1] / previous - 1) * 100


def average_volume(bars: tuple[Bar, ...], period: int = 20) -> float | None:
    recent = bars[-period:]
    if len(recent) < period:
        return None
    return sum(bar.volume for bar in recent) / period


def average_traded_value(bars: tuple[Bar, ...], period: int = 20) -> float | None:
    recent = bars[-period:]
    if len(recent) < period:
        return None
    return sum(bar.value_traded for bar in recent) / period


def relative_volume(bars: tuple[Bar, ...], period: int = 20) -> float | None:
    if len(bars) < period + 1:
        return None
    previous_average = sum(bar.volume for bar in bars[-period - 1 : -1]) / period
    if previous_average <= 0:
        return None
    return bars[-1].volume / previous_average


def active_volume_days(bars: tuple[Bar, ...], period: int = 20) -> int:
    return sum(1 for bar in bars[-period:] if bar.volume > 0)


def on_balance_volume_series(bars: tuple[Bar, ...]) -> list[float]:
    if not bars:
        return []
    values = [float(bars[0].volume)]
    for previous, current in zip(bars[:-1], bars[1:]):
        if current.close > previous.close:
            values.append(values[-1] + current.volume)
        elif current.close < previous.close:
            values.append(values[-1] - current.volume)
        else:
            values.append(values[-1])
    return values


def series_slope_pct(values: list[float], period: int = 20) -> float | None:
    if len(values) < period + 1:
        return None
    previous = values[-period - 1]
    current = values[-1]
    scale = max(abs(previous), 1.0)
    return (current - previous) / scale * 100
