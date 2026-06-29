from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import tomllib


@dataclass(frozen=True)
class MarketConfig:
    base_currency: str = "AED"
    preferred_markets: tuple[str, ...] = ("ADX", "DFM")
    symbols: tuple[str, ...] = ()
    min_bars: int = 30
    min_avg_value_traded: float = 1_000_000


@dataclass(frozen=True)
class NewsConfig:
    rss_feeds: tuple[str, ...] = ()
    negative_keywords: tuple[str, ...] = (
        "fraud",
        "default",
        "lawsuit",
        "fine",
        "downgrade",
        "loss",
        "delay",
        "suspend",
    )
    positive_keywords: tuple[str, ...] = (
        "profit",
        "dividend",
        "upgrade",
        "contract",
        "growth",
        "record",
        "approval",
    )


@dataclass(frozen=True)
class RiskConfig:
    paper_only: bool = True
    cash: float = 100_000
    risk_per_trade_pct: float = 0.005
    max_position_pct: float = 0.10
    min_reward_risk: float = 1.8
    max_open_positions: int = 5


@dataclass(frozen=True)
class AppConfig:
    market: MarketConfig = field(default_factory=MarketConfig)
    news: NewsConfig = field(default_factory=NewsConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)


def load_config(path: Path | str = "config/default.toml") -> AppConfig:
    config_path = Path(path)
    if not config_path.exists():
        return AppConfig()

    data = tomllib.loads(config_path.read_text(encoding="utf-8"))
    market_data = data.get("market", {})
    news_data = data.get("news", {})
    risk_data = data.get("risk", {})

    market = MarketConfig(
        base_currency=str(market_data.get("base_currency", "AED")),
        preferred_markets=tuple(market_data.get("preferred_markets", ("ADX", "DFM"))),
        symbols=tuple(market_data.get("symbols", ())),
        min_bars=int(market_data.get("min_bars", 30)),
        min_avg_value_traded=float(market_data.get("min_avg_value_traded", 1_000_000)),
    )
    news = NewsConfig(
        rss_feeds=tuple(news_data.get("rss_feeds", ())),
        negative_keywords=tuple(news_data.get("negative_keywords", NewsConfig().negative_keywords)),
        positive_keywords=tuple(news_data.get("positive_keywords", NewsConfig().positive_keywords)),
    )
    risk = RiskConfig(
        paper_only=bool(risk_data.get("paper_only", True)),
        cash=float(risk_data.get("cash", 100_000)),
        risk_per_trade_pct=float(risk_data.get("risk_per_trade_pct", 0.005)),
        max_position_pct=float(risk_data.get("max_position_pct", 0.10)),
        min_reward_risk=float(risk_data.get("min_reward_risk", 1.8)),
        max_open_positions=int(risk_data.get("max_open_positions", 5)),
    )
    return AppConfig(market=market, news=news, risk=risk)
