from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OrderTicket:
    symbol: str
    side: str
    quantity: int
    limit_price: float
    stop_loss: float | None = None
    target_price: float | None = None


@dataclass(frozen=True)
class OrderResult:
    accepted: bool
    message: str
    order_id: str | None = None


class Broker:
    def submit_order(self, ticket: OrderTicket) -> OrderResult:
        raise NotImplementedError
