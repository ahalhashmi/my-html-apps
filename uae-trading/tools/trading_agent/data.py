from __future__ import annotations

from csv import DictReader
from datetime import date
from pathlib import Path

from trading_agent.models import Bar, MarketSeries


def load_ohlcv_csv(path: Path) -> MarketSeries:
    rows: list[Bar] = []
    fallback_symbol = path.stem.replace("_", ":")

    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = DictReader(handle)
        for raw in reader:
            symbol = (raw.get("symbol") or fallback_symbol).strip().upper()
            rows.append(
                Bar(
                    symbol=symbol,
                    date=date.fromisoformat(raw["date"]),
                    open=float(raw["open"]),
                    high=float(raw["high"]),
                    low=float(raw["low"]),
                    close=float(raw["close"]),
                    volume=int(raw["volume"]),
                )
            )

    if not rows:
        raise ValueError(f"No OHLCV rows found in {path}")

    rows.sort(key=lambda bar: bar.date)
    symbols = {bar.symbol for bar in rows}
    if len(symbols) != 1:
        raise ValueError(f"{path} contains multiple symbols: {sorted(symbols)}")

    return MarketSeries(symbol=rows[0].symbol, bars=tuple(rows))


def load_ohlcv_dir(path: Path | str) -> dict[str, MarketSeries]:
    data_dir = Path(path)
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory does not exist: {data_dir}")

    series: dict[str, MarketSeries] = {}
    for csv_path in sorted(data_dir.glob("*.csv")):
        loaded = load_ohlcv_csv(csv_path)
        series[loaded.symbol] = loaded

    if not series:
        raise ValueError(f"No CSV files found in {data_dir}")
    return series
