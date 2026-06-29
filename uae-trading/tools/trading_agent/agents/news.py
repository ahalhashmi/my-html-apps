from __future__ import annotations

from dataclasses import dataclass
import re
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from trading_agent.config import NewsConfig
from trading_agent.models import NewsView


@dataclass(frozen=True)
class NewsItem:
    title: str
    link: str = ""


class NewsAgent:
    def __init__(self, config: NewsConfig, timeout_seconds: float = 6.0) -> None:
        self.config = config
        self.timeout_seconds = timeout_seconds

    def analyze(self, symbol: str) -> NewsView:
        items = self._fetch_items()
        matching = [item for item in items if _mentions_symbol(item.title, symbol)]
        if not matching:
            return NewsView(
                symbol=symbol,
                score=50.0,
                risk_level="unknown",
                reasons=("no configured news match; treat as neutral until feeds are added",),
            )

        positive = 0
        negative = 0
        headlines: list[str] = []
        for item in matching[:5]:
            title = item.title
            lower = title.lower()
            headlines.append(title)
            positive += sum(1 for word in self.config.positive_keywords if word in lower)
            negative += sum(1 for word in self.config.negative_keywords if word in lower)

        raw_score = 50 + positive * 12 - negative * 18
        score = max(0, min(raw_score, 100))
        vetoes: tuple[str, ...] = ()
        risk_level = "normal"
        if negative >= 2:
            risk_level = "high"
            vetoes = ("multiple negative news keywords found",)
        elif negative == 1:
            risk_level = "elevated"

        return NewsView(
            symbol=symbol,
            score=float(score),
            risk_level=risk_level,
            headlines=tuple(headlines),
            reasons=(f"{positive} positive and {negative} negative keyword hits",),
            vetoes=vetoes,
        )

    def _fetch_items(self) -> list[NewsItem]:
        items: list[NewsItem] = []
        for feed_url in self.config.rss_feeds:
            try:
                request = Request(feed_url, headers={"User-Agent": "uae-trading-agent/0.1"})
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    body = response.read()
                root = ElementTree.fromstring(body)
                for node in root.findall(".//item"):
                    title = (node.findtext("title") or "").strip()
                    link = (node.findtext("link") or "").strip()
                    if title:
                        items.append(NewsItem(title=title, link=link))
            except Exception:
                continue
        return items


def _mentions_symbol(text: str, symbol: str) -> bool:
    ticker = symbol.split(":")[-1]
    pattern = rf"\b{re.escape(ticker)}\b"
    return re.search(pattern, text, flags=re.IGNORECASE) is not None
