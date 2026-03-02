import uuid
import random
import time
from datetime import datetime, timezone

STORES = ["STORE-001", "STORE-002", "STORE-003"]
TERMINALS = ["T-01", "T-02", "T-03", "T-04"]
EMPLOYEES = [f"EMP-{i:04d}" for i in range(1, 16)]
CUSTOMERS = [
    {"customer_id": f"LOYALTY-{i:06d}", "name": f"Customer {i}", "email": f"customer{i}@example.com", "loyalty_points": random.randint(100, 9999)}
    for i in range(100, 200)
]
PAYMENT_METHODS = ["cash", "credit_card", "debit_card", "mobile_wallet", "gift_card"]

CATALOG = [
    {"item_id": "ITM-1001", "sku": "SKU-MILK-2L",   "name": "Whole Milk 2L",        "price": 3.49, "category": "dairy"},
    {"item_id": "ITM-1002", "sku": "SKU-SOYM-1L",   "name": "Soy Milk 1L",          "price": 2.29, "category": "dairy"},
    {"item_id": "ITM-1003", "sku": "SKU-SOYM-FR",   "name": "Free Range Soy Milk 1L",   "price": 4.99, "category": "dairy"},
    {"item_id": "ITM-1004", "sku": "SKU-BNNA-1KG",  "name": "Bananas 1kg",           "price": 1.89, "category": "produce"},
    {"item_id": "ITM-1005", "sku": "SKU-LEMO-500",  "name": "Lemons 500g",           "price": 7.49, "category": "produce"},
    {"item_id": "ITM-1006", "sku": "SKU-TMAT-CAN",  "name": "Canned Tomatoes 400g",  "price": 0.99, "category": "canned"},
    {"item_id": "ITM-1007", "sku": "SKU-COFE-250",  "name": "Ground Coffee 250g",    "price": 5.99, "category": "beverages"},
    {"item_id": "ITM-1008", "sku": "SKU-WATR-1L",   "name": "Sparkling Water 1L",    "price": 1.19, "category": "beverages"},
]

TAX_RATE = 0.08
CURRENCY = "USD"


def _ts():
    return datetime.now(timezone.utc).isoformat()


def _event_id():
    return str(uuid.uuid4())


def generate_transaction_events():
    """Produce the full ordered event sequence for a single POS transaction.

    Sequence:
      1. employee.login
      2. transaction.started
      3. customer.identified
      4. item.added  (x 2-5)
      5. transaction.subtotal
      6. payment.completed
      7. employee.logout

    All events in a session share a correlation_id for traceability.
    """
    txn_id = str(uuid.uuid4())
    correlation_id = str(uuid.uuid4())
    session_id = str(uuid.uuid4())
    employee = random.choice(EMPLOYEES)
    store = random.choice(STORES)
    terminal = random.choice(TERMINALS)
    customer = random.choice(CUSTOMERS)

    events = []
    login_time = datetime.now(timezone.utc)

    # ── 1. Employee Login ────────────────────────────────────────────
    events.append({
        "event_id": _event_id(),
        "event_type": "employee.login",
        "correlation_id": correlation_id,
        "employee_id": employee,
        "timestamp": _ts(),
        "store_id": store,
        "terminal_id": terminal,
        "session_id": session_id,
        "auth_method": "password",
        "ip_address": f"192.168.1.{random.randint(10, 250)}",
    })

    time.sleep(0.01)

    # ── 2. Transaction Started ───────────────────────────────────────
    events.append({
        "event_id": _event_id(),
        "event_type": "transaction.started",
        "correlation_id": correlation_id,
        "transaction_id": txn_id,
        "employee_id": employee,
        "timestamp": _ts(),
        "store_id": store,
        "terminal_id": terminal,
        "register_id": f"REG-{terminal[-2:]}",
        "currency": CURRENCY,
    })

    time.sleep(0.01)

    # ── 3. Customer Identified ───────────────────────────────────────
    events.append({
        "event_id": _event_id(),
        "event_type": "customer.identified",
        "correlation_id": correlation_id,
        "transaction_id": txn_id,
        "customer_id": customer["customer_id"],
        "customer_name": customer["name"],
        "customer_email": customer["email"],
        "loyalty_points": customer["loyalty_points"],
        "identification_method": random.choice(["loyalty_card", "phone_number", "app_scan"]),
        "timestamp": _ts(),
    })

    # ── 4. Items Added (2-5 items) ───────────────────────────────────
    num_items = random.randint(2, 5)
    chosen_items = random.sample(CATALOG, min(num_items, len(CATALOG)))
    subtotal = 0.0
    item_count = 0

    for seq, item in enumerate(chosen_items, start=1):
        qty = random.randint(1, 3)
        discount = round(random.choice([0, 0, 0, 0.5, 1.0, item["price"] * 0.1]), 2)
        line_total = round((item["price"] * qty) - discount, 2)
        subtotal += line_total
        item_count += qty
        time.sleep(0.005)
        events.append({
            "event_id": _event_id(),
            "event_type": "item.added",
            "correlation_id": correlation_id,
            "transaction_id": txn_id,
            "line_number": seq,
            "item_id": item["item_id"],
            "sku": item["sku"],
            "item_name": item["name"],
            "category": item["category"],
            "quantity": qty,
            "unit_price": item["price"],
            "discount": discount,
            "line_total": line_total,
            "timestamp": _ts(),
        })

    # ── 5. Transaction Subtotal ──────────────────────────────────────
    subtotal = round(subtotal, 2)
    tax = round(subtotal * TAX_RATE, 2)
    discount_total = round(sum(e.get("discount", 0) for e in events if e["event_type"] == "item.added"), 2)
    total = round(subtotal + tax, 2)
    time.sleep(0.01)
    events.append({
        "event_id": _event_id(),
        "event_type": "transaction.subtotal",
        "correlation_id": correlation_id,
        "transaction_id": txn_id,
        "item_count": item_count,
        "subtotal": subtotal,
        "discount_total": discount_total,
        "tax_rate": TAX_RATE,
        "tax": tax,
        "total": total,
        "currency": CURRENCY,
        "timestamp": _ts(),
    })

    # ── 6. Payment Completed ─────────────────────────────────────────
    payment_method = random.choice(PAYMENT_METHODS)
    amount_tendered = total if payment_method != "cash" else round(total + random.choice([0, 0.5, 1.0, 5.0, 10.0]), 2)
    change_due = round(amount_tendered - total, 2)
    time.sleep(0.01)
    events.append({
        "event_id": _event_id(),
        "event_type": "payment.completed",
        "correlation_id": correlation_id,
        "transaction_id": txn_id,
        "payment_method": payment_method,
        "amount_due": total,
        "amount_tendered": amount_tendered,
        "change_due": change_due,
        "currency": CURRENCY,
        "card_last_four": f"{random.randint(1000,9999)}" if "card" in payment_method else None,
        "authorization_code": f"AUTH-{random.randint(100000,999999)}" if payment_method != "cash" else None,
        "receipt_number": f"RCP-{store[-3:]}-{random.randint(10000,99999)}",
        "timestamp": _ts(),
    })

    # ── 7. Employee Logout ───────────────────────────────────────────
    time.sleep(0.01)
    logout_time = datetime.now(timezone.utc)
    session_duration_sec = round((logout_time - login_time).total_seconds(), 2)
    events.append({
        "event_id": _event_id(),
        "event_type": "employee.logout",
        "correlation_id": correlation_id,
        "employee_id": employee,
        "timestamp": _ts(),
        "store_id": store,
        "terminal_id": terminal,
        "session_id": session_id,
        "session_duration_seconds": session_duration_sec,
        "transactions_processed": 1,
    })

    return txn_id, events
