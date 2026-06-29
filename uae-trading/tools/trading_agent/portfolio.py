from __future__ import annotations

from dataclasses import asdict
from datetime import date
import json
from pathlib import Path
from uuid import uuid4

from trading_agent.models import Position


class PortfolioStore:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    def list_positions(self) -> list[Position]:
        if not self.path.exists():
            return []
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        positions: list[Position] = []
        for raw in payload.get("positions", []):
            positions.append(
                Position(
                    id=str(raw["id"]),
                    symbol=str(raw["symbol"]).upper(),
                    buy_date=date.fromisoformat(str(raw["buy_date"])),
                    buy_price=float(raw["buy_price"]),
                    quantity=float(raw["quantity"]),
                    notes=str(raw.get("notes", "")),
                )
            )
        return positions

    def add_position(
        self,
        symbol: str,
        buy_date: str,
        buy_price: float,
        quantity: float,
        notes: str = "",
    ) -> Position:
        normalized_symbol = symbol.strip().upper()
        if ":" not in normalized_symbol:
            raise ValueError("symbol must include market prefix, for example DFM:EMAAR")
        parsed_date = date.fromisoformat(buy_date)
        parsed_price = float(buy_price)
        parsed_quantity = float(quantity)
        if parsed_price <= 0:
            raise ValueError("buy price must be positive")
        if parsed_quantity <= 0:
            raise ValueError("quantity must be positive")

        position = Position(
            id=uuid4().hex,
            symbol=normalized_symbol,
            buy_date=parsed_date,
            buy_price=parsed_price,
            quantity=parsed_quantity,
            notes=notes.strip(),
        )
        positions = self.list_positions()
        positions.append(position)
        self.save_positions(positions)
        return position

    def delete_position(self, position_id: str) -> bool:
        positions = self.list_positions()
        remaining = [position for position in positions if position.id != position_id]
        if len(remaining) == len(positions):
            return False
        self.save_positions(remaining)
        return True

    def save_positions(self, positions: list[Position]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"positions": [position_to_dict(position) for position in positions]}
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def position_to_dict(position: Position) -> dict[str, object]:
    payload = asdict(position)
    payload["buy_date"] = position.buy_date.isoformat()
    return payload


def positions_by_symbol(positions: list[Position]) -> dict[str, Position]:
    latest: dict[str, Position] = {}
    for position in sorted(positions, key=lambda item: item.buy_date):
        latest[position.symbol] = position
    return latest
