from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile

from trading_agent.consideration_service import (
    build_decisions_for_rows,
    combined_profile_to_dict,
    scan_considerations,
    summarize_considerations,
)
from trading_agent.data_sources.stockanalysis import update_stockanalysis_ohlcv
from trading_agent.validation import ValidationStore


def main() -> int:
    app_root = Path(__file__).resolve().parents[1]
    output_path = app_root / "data" / "latest.json"
    performance_path = app_root / "data" / "performance.json"
    validation_path = app_root / "data" / "validation.sqlite"
    data_dir = Path(tempfile.gettempdir()) / "uae-trading-ohlcv"

    data_result = update_stockanalysis_ohlcv(data_dir, markets=("DFM", "ADX"))
    rows = scan_considerations(data_dir, market="all", sort_key="score")
    decisions = build_decisions_for_rows(data_dir, rows)
    scanned_at = datetime.now(timezone.utc).isoformat(timespec="seconds")

    payload = {
        "trigger": "github-action",
        "scanned_at": scanned_at,
        "data_dir": "github-action",
        "market": "all",
        "profiles": [
            combined_profile_to_dict(trend, consideration, decisions.get(trend.symbol))
            for trend, consideration in rows
        ],
        "summary": summarize_considerations(rows),
        "last_data_update": {
            "source": data_result.source,
            "data_dir": str(data_result.data_dir),
            "updated_at": data_result.updated_at,
            "symbols_total": data_result.symbols_total,
            "files_written": data_result.files_written,
            "failures": data_result.failures,
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    performance = ValidationStore(validation_path).record_snapshot(payload, data_dir)
    performance_path.write_text(json.dumps(performance, indent=2), encoding="utf-8")
    print(f"Wrote {len(rows)} symbols to {output_path}")
    print(f"Wrote decision performance to {performance_path}")
    return 0 if not data_result.failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
