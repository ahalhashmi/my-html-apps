from __future__ import annotations

from datetime import datetime, timezone
from itertools import count

from trading_agent.brokers.base import Broker, OrderResult, OrderTicket


class PaperBroker(Broker):
    def __init__(self) -> None:
        self._ids = count(1)
        self.orders: list[OrderTicket] = []

    def submit_order(self, ticket: OrderTicket) -> OrderResult:
        if ticket.quantity <= 0:
            return OrderResult(accepted=False, message="quantity must be positive")

        self.orders.append(ticket)
        order_id = f"PAPER-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._ids):04d}"
        return OrderResult(accepted=True, message="paper order accepted", order_id=order_id)
