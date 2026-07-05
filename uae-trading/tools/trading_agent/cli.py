from __future__ import annotations

import argparse
from pathlib import Path

from trading_agent.agents.decision import DecisionAgent
from trading_agent.agents.news import NewsAgent
from trading_agent.agents.screener import ScreenerAgent
from trading_agent.agents.technical import TechnicalAgent
from trading_agent.config import load_config
from trading_agent.consideration_service import build_decisions_for_rows, scan_considerations, write_consideration_csv
from trading_agent.data_sources.stockanalysis import update_stockanalysis_ohlcv
from trading_agent.data import load_ohlcv_dir
from trading_agent.models import ConsiderationProfile, TradeIdea, TrendProfile, TrendWindow
from trading_agent.trend_service import scan_trends, write_trend_csv


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="uae-trading-agent")
    subparsers = parser.add_subparsers(dest="command", required=True)

    scan = subparsers.add_parser("scan", help="scan local OHLCV data and produce paper trade ideas")
    scan.add_argument("--config", default="config/default.toml", help="path to TOML config")
    scan.add_argument("--data-dir", default="data/sample_ohlcv", help="directory of OHLCV CSV files")
    scan.add_argument("--cash", type=float, default=None, help="override configured paper cash")
    scan.add_argument("--limit", type=int, default=10, help="maximum rows to print")

    trend = subparsers.add_parser("trend", help="rank market trends across 7d, 1m, 6m, and 1y windows")
    trend.add_argument("--data-dir", default="data/sample_ohlcv", help="directory of OHLCV CSV files")
    trend.add_argument("--market", choices=["all", "ADX", "DFM"], default="all", help="optional market filter")
    trend.add_argument("--limit", type=int, default=50, help="maximum rows to print")
    trend.add_argument("--sort", choices=["overall", "7d", "1m", "6m", "1y"], default="overall")
    trend.add_argument("--output", help="optional CSV output path")

    update_data = subparsers.add_parser("update-data", help="download UAE tradable-symbol trend data")
    update_data.add_argument("--source", choices=["stockanalysis"], default="stockanalysis")
    update_data.add_argument("--data-dir", default="data/uae_ohlcv")
    update_data.add_argument("--markets", nargs="+", choices=["ADX", "DFM"], default=["DFM", "ADX"])
    update_data.add_argument("--limit", type=int, default=None, help="optional symbol limit for testing")
    update_data.add_argument("--workers", type=int, default=8)

    consider = subparsers.add_parser("consider", help="rank stocks by opportunity/consideration score")
    consider.add_argument("--data-dir", default="data/uae_ohlcv")
    consider.add_argument("--market", choices=["all", "ADX", "DFM"], default="all")
    consider.add_argument(
        "--sort",
        choices=["score", "liquidity", "trend", "momentum", "volume", "risk", "location", "confluence", "zone", "symbol"],
        default="score",
    )
    consider.add_argument("--limit", type=int, default=30)
    consider.add_argument("--output", help="optional CSV output path")

    args = parser.parse_args(argv)
    if args.command == "scan":
        return _scan(args)
    if args.command == "trend":
        return _trend(args)
    if args.command == "update-data":
        return _update_data(args)
    if args.command == "consider":
        return _consider(args)
    return 1


def _scan(args: argparse.Namespace) -> int:
    config = load_config(args.config)
    if args.cash is not None:
        from dataclasses import replace

        config = replace(config, risk=replace(config.risk, cash=args.cash))

    universe = load_ohlcv_dir(Path(args.data_dir))
    if config.market.symbols:
        universe = {symbol: series for symbol, series in universe.items() if symbol in config.market.symbols}

    screener = ScreenerAgent(config.market)
    technical_agent = TechnicalAgent()
    news_agent = NewsAgent(config.news)
    decision_agent = DecisionAgent(config.risk)

    ideas: list[TradeIdea] = []
    for candidate in screener.screen(universe):
        series = universe[candidate.symbol]
        technical = technical_agent.analyze(series)
        news = news_agent.analyze(candidate.symbol)
        ideas.append(decision_agent.decide(candidate, technical, news))

    ideas.sort(key=lambda idea: idea.confidence, reverse=True)
    _print_ideas(ideas[: args.limit], config.risk.paper_only)
    return 0


def _trend(args: argparse.Namespace) -> int:
    profiles = scan_trends(Path(args.data_dir), market=args.market, sort_key=args.sort)

    if args.output:
        write_trend_csv(profiles, Path(args.output))

    _print_trend_profiles(profiles[: args.limit])
    if args.output:
        print(f"\nCSV written to {args.output}")
    return 0


def _update_data(args: argparse.Namespace) -> int:
    result = update_stockanalysis_ohlcv(
        Path(args.data_dir),
        markets=tuple(args.markets),
        workers=args.workers,
        limit=args.limit,
    )
    print(f"Source: {result.source}")
    print(f"Data dir: {result.data_dir}")
    print(f"Symbols: {result.symbols_total}")
    print(f"Files written: {result.files_written}")
    if result.failures:
        print("Failures:")
        for failure in result.failures:
            print(f"  - {failure}")
    return 0 if not result.failures else 1


def _consider(args: argparse.Namespace) -> int:
    rows = scan_considerations(Path(args.data_dir), market=args.market, sort_key=args.sort)
    decisions = build_decisions_for_rows(Path(args.data_dir), rows)
    if args.output:
        write_consideration_csv(rows, Path(args.output), decisions)
    _print_considerations(rows[: args.limit], decisions)
    if args.output:
        print(f"\nCSV written to {args.output}")
    return 0


def _print_considerations(
    rows: list[tuple[TrendProfile, ConsiderationProfile]],
    decisions: dict[str, object],
) -> None:
    print("Consideration scan: long-side opportunity ranking")
    print(
        f"{'symbol':<14} {'action':<6} {'setup':<14} {'grade':>5} {'tier':>4} {'verdict':<15} {'score':>6} "
        f"{'buy zone':>17} {'stop':>8} {'trail':>8} {'target2':>8} {'rr':>5} {'rsi':>6} {'avg value':>12}"
    )
    print("-" * 154)
    for _, profile in rows:
        indicators = profile.indicators
        decision = decisions[profile.symbol]
        print(
            f"{profile.symbol:<14} {decision.action:<6} {decision.setup_type:<14} {decision.setup_grade:>5} "
            f"{decision.liquidity_tier:>4} "
            f"{profile.verdict:<15} {profile.score:>6.1f} "
            f"{_fmt_range(decision.suggested_buy_low, decision.suggested_buy_high):>17} "
            f"{_fmt_price(decision.stop_loss):>8} {_fmt_price(decision.trailing_stop):>8} {_fmt_price(decision.target2):>8} "
            f"{_fmt_float(decision.risk_reward):>5} {_fmt_float(indicators.rsi14):>6} "
            f"{_fmt_value(indicators.avg_value20):>12}"
        )
        detail = decision.warnings[:1] or decision.reasons[:2] or profile.vetoes or profile.warnings[:1] or profile.reasons[:2]
        for item in detail:
            print(f"  - {item}")


def _print_ideas(ideas: list[TradeIdea], paper_only: bool) -> None:
    mode = "PAPER ONLY" if paper_only else "LIVE ENABLED"
    print(f"Mode: {mode}")
    print(
        f"{'symbol':<12} {'action':<10} {'conf':>6} {'entry':>9} {'stop':>9} "
        f"{'target1':>9} {'rr':>5} {'shares':>8} {'value':>11}"
    )
    print("-" * 86)
    for idea in ideas:
        print(
            f"{idea.symbol:<12} {idea.action:<10} {idea.confidence:>6.1f} "
            f"{_fmt_price(idea.entry):>9} {_fmt_price(idea.stop_loss):>9} "
            f"{_fmt_price(idea.target1):>9} {_fmt_float(idea.reward_risk):>5} "
            f"{idea.shares:>8} {idea.max_position_value:>11,.2f}"
        )
        detail = idea.vetoes or idea.reasons[:3]
        for item in detail:
            print(f"  - {item}")


def _fmt_price(value: float | None) -> str:
    return "-" if value is None else f"{value:.3f}"


def _fmt_range(low: float | None, high: float | None) -> str:
    if low is None or high is None:
        return "-"
    return f"{low:.3f}-{high:.3f}"


def _fmt_float(value: float | None) -> str:
    return "-" if value is None else f"{value:.2f}"


def _fmt_value(value: float | None) -> str:
    if value is None:
        return "-"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value / 1_000:.0f}K"
    return f"{value:.0f}"


def _print_trend_profiles(profiles: list[TrendProfile]) -> None:
    print("Trend scan: local OHLCV data")
    print(
        f"{'symbol':<12} {'close':>9} {'overall':<9} {'score':>7} "
        f"{'7d':>15} {'1m':>15} {'6m':>15} {'1y':>15}"
    )
    print("-" * 108)
    for profile in profiles:
        windows = {window.name: window for window in profile.windows}
        print(
            f"{profile.symbol:<12} {profile.last_close:>9.3f} "
            f"{profile.overall_direction:<9} {profile.overall_score:>7.1f} "
            f"{_fmt_window(windows['7d']):>15} {_fmt_window(windows['1m']):>15} "
            f"{_fmt_window(windows['6m']):>15} {_fmt_window(windows['1y']):>15}"
        )


def _fmt_window(window: TrendWindow) -> str:
    if window.return_pct is None:
        return "unknown"
    if window.direction == "unknown":
        return f"short {window.return_pct:+.1f}%"
    label = {"bullish": "bull", "bearish": "bear", "sideways": "side", "unknown": "unk"}[window.direction]
    return f"{label} {window.return_pct:+.1f}%/{window.strength:.0f}"


if __name__ == "__main__":
    raise SystemExit(main())
