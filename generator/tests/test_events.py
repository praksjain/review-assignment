import pytest
from events import generate_transaction_events, CATALOG, TAX_RATE


class TestTransactionEventGeneration:

    def test_returns_tuple_of_txn_id_and_events(self):
        txn_id, events = generate_transaction_events()
        assert isinstance(txn_id, str)
        assert len(txn_id) == 36  # UUID format
        assert isinstance(events, list)
        assert len(events) >= 7  # min: login + start + customer + 2 items + subtotal + payment + logout

    def test_event_ordering(self):
        _, events = generate_transaction_events()
        types = [e["event_type"] for e in events]
        assert types[0] == "employee.login"
        assert types[1] == "transaction.started"
        assert types[2] == "customer.identified"
        assert types[-3] == "transaction.subtotal"
        assert types[-2] == "payment.completed"
        assert types[-1] == "employee.logout"
        for t in types[3:-3]:
            assert t == "item.added"

    def test_transaction_id_consistency(self):
        txn_id, events = generate_transaction_events()
        for e in events:
            if e["event_type"] not in ("employee.login", "employee.logout"):
                assert e["transaction_id"] == txn_id

    def test_subtotal_matches_items(self):
        _, events = generate_transaction_events()
        items = [e for e in events if e["event_type"] == "item.added"]
        expected_subtotal = sum(e["line_total"] for e in items)
        subtotal_event = next(e for e in events if e["event_type"] == "transaction.subtotal")
        assert abs(subtotal_event["subtotal"] - expected_subtotal) < 0.01
        assert abs(subtotal_event["tax"] - round(expected_subtotal * TAX_RATE, 2)) < 0.01

    def test_payment_matches_total(self):
        _, events = generate_transaction_events()
        subtotal_event = next(e for e in events if e["event_type"] == "transaction.subtotal")
        payment_event = next(e for e in events if e["event_type"] == "payment.completed")
        assert payment_event["amount_paid"] == subtotal_event["total"]

    def test_employee_fields_present(self):
        _, events = generate_transaction_events()
        login = events[0]
        assert "employee_id" in login
        assert "store_id" in login
        assert "terminal_id" in login
        assert "timestamp" in login

    def test_item_added_fields(self):
        _, events = generate_transaction_events()
        item_events = [e for e in events if e["event_type"] == "item.added"]
        assert len(item_events) >= 2
        for ie in item_events:
            assert "item_id" in ie
            assert "sku" in ie
            assert "quantity" in ie
            assert ie["quantity"] >= 1
            assert ie["price"] > 0
