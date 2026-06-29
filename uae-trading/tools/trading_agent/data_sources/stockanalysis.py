from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from csv import DictWriter
from dataclasses import dataclass
from datetime import date, datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from typing import Iterable
from urllib.parse import quote
from urllib.request import Request, urlopen


BASE_URL = "https://stockanalysis.com"
LIST_URLS = {
    "DFM": f"{BASE_URL}/list/dubai-financial-market/",
    "ADX": f"{BASE_URL}/list/abu-dhabi-securities-exchange/",
}
USER_AGENT = "Mozilla/5.0"


@dataclass(frozen=True)
class ListedSecurity:
    market: str
    symbol: str
    name: str

    @property
    def full_symbol(self) -> str:
        return f"{self.market}:{self.symbol}"


@dataclass(frozen=True)
class UpdateResult:
    source: str
    data_dir: str
    updated_at: str
    symbols_total: int
    files_written: int
    failures: tuple[str, ...]


@dataclass(frozen=True)
class OhlcvRow:
    date: date
    open: float
    high: float
    low: float
    close: float
    volume: int


class HtmlTableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.in_table = False
        self.in_row = False
        self.in_cell = False
        self.rows: list[list[str]] = []
        self.row: list[str] = []
        self.cell: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table" and not self.in_table:
            self.in_table = True
        elif self.in_table and tag == "tr":
            self.in_row = True
            self.row = []
        elif self.in_row and tag in {"td", "th"}:
            self.in_cell = True
            self.cell = []

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self.in_cell and tag in {"td", "th"}:
            self.row.append(" ".join("".join(self.cell).split()))
            self.in_cell = False
        elif self.in_row and tag == "tr":
            if self.row:
                self.rows.append(self.row)
            self.in_row = False
        elif self.in_table and tag == "table":
            self.in_table = False


def update_stockanalysis_ohlcv(
    data_dir: Path | str,
    markets: Iterable[str] = ("DFM", "ADX"),
    workers: int = 8,
    limit: int | None = None,
) -> UpdateResult:
    output_dir = Path(data_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    securities = fetch_universe(markets)
    if limit is not None:
        securities = securities[:limit]

    failures: list[str] = []
    files_written = 0
    with ThreadPoolExecutor(max_workers=max(workers, 1)) as executor:
        futures = {executor.submit(_write_security_history, output_dir, security): security for security in securities}
        for future in as_completed(futures):
            security = futures[future]
            try:
                future.result()
                files_written += 1
            except Exception as exc:
                failures.append(f"{security.full_symbol}: {exc}")

    result = UpdateResult(
        source="stockanalysis",
        data_dir=str(output_dir),
        updated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        symbols_total=len(securities),
        files_written=files_written,
        failures=tuple(failures),
    )
    (output_dir / "manifest.json").write_text(json.dumps(result.__dict__, indent=2), encoding="utf-8")
    return result


def fetch_universe(markets: Iterable[str] = ("DFM", "ADX")) -> list[ListedSecurity]:
    securities: list[ListedSecurity] = []
    for market in markets:
        market_code = market.upper()
        url = LIST_URLS[market_code]
        html = _fetch_text(url)
        securities.extend(parse_listed_securities(html, market_code))
    securities.sort(key=lambda item: (item.market, item.symbol))
    return securities


def parse_listed_securities(html: str, market: str) -> list[ListedSecurity]:
    parser = HtmlTableParser()
    parser.feed(html)
    securities: list[ListedSecurity] = []
    seen: set[str] = set()
    for row in parser.rows:
        if len(row) < 3 or row[0] == "No.":
            continue
        symbol = row[1].strip().upper()
        name = row[2].strip()
        if not symbol or symbol in seen:
            continue
        if not re.match(r"^[A-Z0-9.-]+$", symbol):
            continue
        securities.append(ListedSecurity(market=market, symbol=symbol, name=name))
        seen.add(symbol)
    return securities


def fetch_close_history(security: ListedSecurity) -> list[tuple[date, float]]:
    api_symbol = quote(f"{security.market}-{security.symbol}", safe="")
    url = f"{BASE_URL}/api/symbol/a/{api_symbol}/history?type=chart"
    payload = json.loads(_fetch_text(url, referer=f"{BASE_URL}/quote/{security.market.lower()}/{quote(security.symbol)}/history/"))
    if payload.get("status") != 200:
        raise ValueError(f"unexpected status {payload.get('status')}")
    rows: list[tuple[date, float]] = []
    for raw_timestamp, raw_close in payload.get("data", []):
        day = datetime.fromtimestamp(raw_timestamp / 1000, timezone.utc).date()
        rows.append((day, float(raw_close)))
    if not rows:
        raise ValueError("no chart data returned")
    return rows


def fetch_recent_ohlcv(security: ListedSecurity) -> list[OhlcvRow]:
    url = f"{BASE_URL}/quote/{security.market.lower()}/{quote(security.symbol)}/history/"
    parser = HtmlTableParser()
    parser.feed(_fetch_text(url))
    rows: list[OhlcvRow] = []
    for row in parser.rows:
        if len(row) < 8 or row[0] == "Date":
            continue
        try:
            rows.append(
                OhlcvRow(
                    date=datetime.strptime(row[0], "%b %d, %Y").date(),
                    open=_parse_float(row[1]),
                    high=_parse_float(row[2]),
                    low=_parse_float(row[3]),
                    close=_parse_float(row[4]),
                    volume=_parse_int(row[7]),
                )
            )
        except ValueError:
            continue
    rows.sort(key=lambda item: item.date)
    return rows


def write_history_csv(
    data_dir: Path,
    security: ListedSecurity,
    close_rows: list[tuple[date, float]],
    recent_rows: list[OhlcvRow],
) -> Path:
    csv_path = data_dir / f"{security.market}_{_safe_filename(security.symbol)}.csv"
    recent_by_date = {row.date: row for row in recent_rows}
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = DictWriter(handle, fieldnames=["date", "symbol", "open", "high", "low", "close", "volume"])
        writer.writeheader()
        for day, close in close_rows:
            recent = recent_by_date.get(day)
            if recent:
                open_price = recent.open
                high = recent.high
                low = recent.low
                close = recent.close
                volume = recent.volume
            else:
                open_price = high = low = close
                volume = 0
            writer.writerow(
                {
                    "date": day.isoformat(),
                    "symbol": security.full_symbol,
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }
            )
    return csv_path


def write_close_history_csv(data_dir: Path, security: ListedSecurity, rows: list[tuple[str, float]]) -> Path:
    close_rows = [(date.fromisoformat(day), close) for day, close in rows]
    return write_history_csv(data_dir, security, close_rows, [])


def _write_security_history(data_dir: Path, security: ListedSecurity) -> Path:
    close_rows = fetch_close_history(security)
    try:
        recent_rows = fetch_recent_ohlcv(security)
    except Exception:
        recent_rows = []
    return write_history_csv(data_dir, security, close_rows, recent_rows)


def _fetch_text(url: str, referer: str | None = None) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json,text/html,application/xhtml+xml",
    }
    if referer:
        headers["Referer"] = referer
    request = Request(url, headers=headers)
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "ignore")


def _safe_filename(symbol: str) -> str:
    return re.sub(r"[^A-Z0-9.-]+", "_", symbol.upper())


def _parse_float(value: str) -> float:
    cleaned = value.replace(",", "").strip()
    if cleaned in {"", "-"}:
        raise ValueError("missing number")
    return float(cleaned)


def _parse_int(value: str) -> int:
    cleaned = value.replace(",", "").strip()
    if cleaned in {"", "-"}:
        return 0
    return int(float(cleaned))
