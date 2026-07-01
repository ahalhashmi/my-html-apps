from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone, tzinfo
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
import threading
from typing import Any
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from trading_agent.data_sources.stockanalysis import UpdateResult, update_stockanalysis_ohlcv
from trading_agent.consideration_service import (
    build_decisions_for_rows,
    combined_profile_to_dict,
    scan_considerations,
    summarize_considerations,
    write_consideration_csv,
)
from trading_agent.portfolio import PortfolioStore, position_to_dict
from trading_agent.validation import ValidationStore


STATIC_ROOT = Path(__file__).with_name("web")


@dataclass(frozen=True)
class ScanSnapshot:
    trigger: str
    scanned_at: str
    data_dir: str
    market: str
    profiles: list[dict[str, object]]
    summary: dict[str, int]


class DashboardState:
    def __init__(
        self,
        data_dir: Path,
        output_dir: Path,
        market: str,
        daily_time: str,
        timezone_name: str,
        auto_scan: bool,
        source: str,
        portfolio_path: Path,
        validation_path: Path,
    ) -> None:
        self.data_dir = data_dir
        self.output_dir = output_dir
        self.market = market
        self.daily_time = _parse_daily_time(daily_time)
        self.timezone_name = timezone_name
        self.timezone = _load_timezone(timezone_name)
        self.auto_scan = auto_scan
        self.source = source
        self.portfolio = PortfolioStore(portfolio_path)
        self.validation = ValidationStore(validation_path)
        self.last_data_update: UpdateResult | None = None
        self.latest_validation: dict[str, object] | None = None
        self.latest: ScanSnapshot | None = None
        self.last_error: str | None = None
        self.last_validation_error: str | None = None
        self.is_scanning = False
        self.scan_started_at: str | None = None
        self.last_auto_scan_date: str | None = None
        self.scan_count = 0
        self.lock = threading.RLock()
        self.scan_lock = threading.Lock()

    @property
    def latest_json_path(self) -> Path:
        return self.output_dir / "trend_latest.json"

    @property
    def latest_csv_path(self) -> Path:
        return self.output_dir / "trend_latest.csv"

    def status(self) -> dict[str, object]:
        with self.lock:
            return {
                "data_dir": str(self.data_dir),
                "market": self.market,
                "auto_scan": self.auto_scan,
                "source": self.source,
                "daily_time": self.daily_time.strftime("%H:%M"),
                "timezone": self.timezone_name,
                "is_scanning": self.is_scanning,
                "scan_started_at": self.scan_started_at,
                "scan_count": self.scan_count,
                "last_error": self.last_error,
                "last_validation_error": self.last_validation_error,
                "last_data_update": self.last_data_update.__dict__ if self.last_data_update else None,
                "next_daily_scan": self._next_daily_scan().isoformat(timespec="seconds"),
                "latest": self._latest_payload_locked(),
                "validation": self.latest_validation,
                "portfolio": [position_to_dict(position) for position in self.portfolio.list_positions()],
                "csv_available": self.latest_csv_path.exists(),
            }

    def update_settings(self, auto_scan: bool | None = None, daily_time: str | None = None) -> dict[str, object]:
        with self.lock:
            if auto_scan is not None:
                self.auto_scan = bool(auto_scan)
            if daily_time is not None:
                self.daily_time = _parse_daily_time(daily_time)
            return self.status()

    def run_scan(self, trigger: str, refresh_data: bool = True) -> dict[str, object]:
        if not self.scan_lock.acquire(blocking=False):
            raise RuntimeError("scan already running")

        started_at = self._now().isoformat(timespec="seconds")
        with self.lock:
            self.is_scanning = True
            self.scan_started_at = started_at
            self.last_error = None

        try:
            if refresh_data and self.source == "stockanalysis":
                markets = ("DFM", "ADX") if self.market == "all" else (self.market,)
                data_result = update_stockanalysis_ohlcv(self.data_dir, markets=markets)
                with self.lock:
                    self.last_data_update = data_result
            profiles = scan_considerations(self.data_dir, market=self.market, sort_key="score")
            positions = self.portfolio.list_positions()
            decisions = build_decisions_for_rows(self.data_dir, profiles, positions)
            scanned_at = self._now().isoformat(timespec="seconds")
            snapshot = ScanSnapshot(
                trigger=trigger,
                scanned_at=scanned_at,
                data_dir=str(self.data_dir),
                market=self.market,
                profiles=[
                    combined_profile_to_dict(trend, consideration, decisions.get(trend.symbol))
                    for trend, consideration in profiles
                ],
                summary=summarize_considerations(profiles),
            )
            self._persist_snapshot(snapshot, profiles, decisions)
            validation_report = self._record_validation(snapshot)
            with self.lock:
                self.latest = snapshot
                self.latest_validation = validation_report
                self.scan_count += 1
                if trigger == "daily":
                    self.last_auto_scan_date = self._now().date().isoformat()
        except Exception as exc:
            with self.lock:
                self.last_error = str(exc)
        finally:
            with self.lock:
                self.is_scanning = False
                self.scan_started_at = None
            self.scan_lock.release()
        return self.status()

    def performance(self) -> dict[str, object]:
        return self.validation.performance_report()

    def add_position(self, payload: dict[str, Any]) -> dict[str, object]:
        self.portfolio.add_position(
            symbol=str(payload.get("symbol", "")),
            buy_date=str(payload.get("buy_date", "")),
            buy_price=float(payload.get("buy_price", 0)),
            quantity=float(payload.get("quantity", 0)),
            notes=str(payload.get("notes", "")),
        )
        return self.run_scan("portfolio", refresh_data=False)

    def delete_position(self, position_id: str) -> dict[str, object]:
        if not self.portfolio.delete_position(position_id):
            raise ValueError("position not found")
        return self.run_scan("portfolio", refresh_data=False)

    def run_due_daily_scan(self) -> None:
        with self.lock:
            if not self.auto_scan or self.is_scanning:
                return
            now = self._now()
            today = now.date().isoformat()
            due = now.time() >= self.daily_time and self.last_auto_scan_date != today
        if due:
            self.run_scan("daily")

    def _persist_snapshot(self, snapshot: ScanSnapshot, profiles: list[Any], decisions: dict[str, Any]) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.latest_json_path.write_text(
            json.dumps(snapshot.__dict__, indent=2),
            encoding="utf-8",
        )
        write_consideration_csv(profiles, self.latest_csv_path, decisions)

    def _record_validation(self, snapshot: ScanSnapshot) -> dict[str, object]:
        try:
            report = self.validation.record_snapshot(snapshot, self.data_dir)
        except Exception as exc:  # Validation should never block the scanner itself.
            with self.lock:
                self.last_validation_error = str(exc)
            return self.validation.performance_report()
        with self.lock:
            self.last_validation_error = None
        return report

    def _latest_payload_locked(self) -> dict[str, object] | None:
        if self.latest is None:
            return None
        return self.latest.__dict__

    def _next_daily_scan(self) -> datetime:
        now = self._now()
        scheduled = datetime.combine(now.date(), self.daily_time, tzinfo=self.timezone)
        if now >= scheduled or self.last_auto_scan_date == now.date().isoformat():
            scheduled += timedelta(days=1)
        return scheduled

    def _now(self) -> datetime:
        return datetime.now(self.timezone)


def make_handler(state: DashboardState) -> type[SimpleHTTPRequestHandler]:
    class DashboardHandler(SimpleHTTPRequestHandler):
        app_state = state

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/status":
                self._send_json(self.app_state.status())
                return
            if path == "/api/trends":
                status = self.app_state.status()
                latest = status.get("latest")
                if latest is None:
                    self._send_json({"error": "no scan available yet"}, HTTPStatus.NOT_FOUND)
                else:
                    self._send_json(latest)
                return
            if path == "/api/portfolio":
                self._send_json({"positions": self.app_state.status()["portfolio"]})
                return
            if path == "/api/performance":
                self._send_json(self.app_state.performance())
                return
            if path == "/api/export.csv":
                self._send_file(self.app_state.latest_csv_path)
                return
            if path == "/":
                self._send_file(STATIC_ROOT / "index.html")
                return
            if path == "/favicon.ico":
                self.send_response(HTTPStatus.NO_CONTENT)
                self.end_headers()
                return
            if path.startswith("/static/"):
                relative = path.removeprefix("/static/")
                self._send_static(relative)
                return
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            if path == "/api/scan":
                try:
                    self._send_json(self.app_state.run_scan("manual"))
                except RuntimeError as exc:
                    self._send_json({"error": str(exc)}, HTTPStatus.CONFLICT)
                return
            if path == "/api/settings":
                payload = self._read_json()
                try:
                    self._send_json(
                        self.app_state.update_settings(
                            auto_scan=payload.get("auto_scan"),
                            daily_time=payload.get("daily_time"),
                        )
                    )
                except ValueError as exc:
                    self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            if path == "/api/portfolio":
                try:
                    self._send_json(self.app_state.add_position(self._read_json()))
                except (KeyError, TypeError, ValueError) as exc:
                    self._send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
                return
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def do_DELETE(self) -> None:
            parsed = urlparse(self.path)
            if parsed.path == "/api/portfolio":
                position_id = parse_qs(parsed.query).get("id", [""])[0]
                try:
                    self._send_json(self.app_state.delete_position(position_id))
                except ValueError as exc:
                    self._send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
                return
            self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)

        def log_message(self, format: str, *args: object) -> None:
            return

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            body = self.rfile.read(length)
            return json.loads(body.decode("utf-8"))

        def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _send_static(self, relative_path: str) -> None:
            target = (STATIC_ROOT / relative_path).resolve()
            root = STATIC_ROOT.resolve()
            try:
                target.relative_to(root)
            except ValueError:
                self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            if not target.is_file():
                self._send_json({"error": "not found"}, HTTPStatus.NOT_FOUND)
                return
            self._send_file(target)

        def _send_file(self, path: Path) -> None:
            if not path.is_file():
                self._send_json({"error": "file not found"}, HTTPStatus.NOT_FOUND)
                return
            body = path.read_bytes()
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or path.suffix in {".js", ".css", ".json"}:
                content_type += "; charset=utf-8"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return DashboardHandler


def scheduler_loop(state: DashboardState, stop_event: threading.Event) -> None:
    while not stop_event.wait(30):
        state.run_due_daily_scan()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="uae-trading-dashboard")
    parser.add_argument("--data-dir", default="data/sample_ohlcv")
    parser.add_argument("--output-dir", default="output")
    parser.add_argument("--market", choices=["all", "ADX", "DFM"], default="all")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--daily-time", default="08:00")
    parser.add_argument("--timezone", default="Asia/Dubai")
    parser.add_argument("--no-auto-scan", action="store_true")
    parser.add_argument("--source", choices=["local", "stockanalysis"], default="local")
    parser.add_argument("--portfolio-path", default="output/portfolio.json")
    parser.add_argument("--validation-path", default="output/validation.sqlite")
    args = parser.parse_args(argv)

    state = DashboardState(
        data_dir=Path(args.data_dir),
        output_dir=Path(args.output_dir),
        market=args.market,
        daily_time=args.daily_time,
        timezone_name=args.timezone,
        auto_scan=not args.no_auto_scan,
        source=args.source,
        portfolio_path=Path(args.portfolio_path),
        validation_path=Path(args.validation_path),
    )
    stop_event = threading.Event()
    scheduler = threading.Thread(target=scheduler_loop, args=(state, stop_event), daemon=True)
    scheduler.start()

    server = ThreadingHTTPServer((args.host, args.port), make_handler(state))
    startup_scan = threading.Thread(target=state.run_scan, args=("startup",), daemon=True)
    startup_scan.start()
    print(f"UAE trend dashboard running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        server.server_close()
    return 0


def _parse_daily_time(value: str) -> time:
    try:
        parsed = datetime.strptime(value, "%H:%M")
    except ValueError as exc:
        raise ValueError("daily_time must use HH:MM format") from exc
    return parsed.time()


def _load_timezone(name: str) -> tzinfo:
    if name == "Asia/Dubai":
        return timezone(timedelta(hours=4), name)
    if name == "UTC":
        return timezone.utc
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return timezone.utc


if __name__ == "__main__":
    raise SystemExit(main())
