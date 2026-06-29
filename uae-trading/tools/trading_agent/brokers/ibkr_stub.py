from __future__ import annotations

from trading_agent.brokers.base import Broker, OrderResult, OrderTicket


class IbkrBroker(Broker):
    """Placeholder for future IBKR integration.

    The first real implementation should start in read-only mode, then paper
    trading, then live orders with manual confirmation.
    """

    def submit_order(self, ticket: OrderTicket) -> OrderResult:
        return OrderResult(
            accepted=False,
            message="IBKR live submission is intentionally disabled in this scaffold.",
        )
