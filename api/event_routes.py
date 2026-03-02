import os
import uuid
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from middleware import get_current_user

log = logging.getLogger("api.events")

router = APIRouter(prefix="/pos", tags=["pos-terminal"])

KAFKA_BROKER = os.getenv("KAFKA_BROKER", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "pos-events")

_producer = None


def _get_producer():
    global _producer
    if _producer is None:
        from confluent_kafka import Producer
        _producer = Producer({
            "bootstrap.servers": KAFKA_BROKER,
            "client.id": "api-pos-terminal",
        })
    return _producer


def _publish(event: dict):
    producer = _get_producer()
    key = event.get("transaction_id") or event.get("employee_id", "unknown")
    producer.produce(
        topic=KAFKA_TOPIC,
        key=str(key),
        value=json.dumps(event),
    )
    producer.flush(timeout=5)
    log.info("Published %s  key=%s", event["event_type"], key)


def _base(event_type: str, user: dict) -> dict:
    return {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "correlation_id": str(uuid.uuid4()),
        "employee_id": f"EMP-{user['employee_id']:04d}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ── Start Transaction ────────────────────────────────────────────────

class StartTransactionRequest(BaseModel):
    store_id: str = "STORE-001"
    terminal_id: str = "T-01"

@router.post("/transaction/start")
def start_transaction(body: StartTransactionRequest, user: dict = Depends(get_current_user)):
    txn_id = str(uuid.uuid4())
    event = _base("transaction.started", user)
    event.update({
        "transaction_id": txn_id,
        "store_id": body.store_id,
        "terminal_id": body.terminal_id,
        "register_id": f"REG-{body.terminal_id[-2:]}",
        "currency": "USD",
    })
    _publish(event)
    return {"transaction_id": txn_id, "event": event}


# ── Identify Customer ────────────────────────────────────────────────

class IdentifyCustomerRequest(BaseModel):
    transaction_id: str
    customer_id: str = "LOYALTY-000100"
    customer_name: str = "Arpan Joshi"

@router.post("/transaction/customer")
def identify_customer(body: IdentifyCustomerRequest, user: dict = Depends(get_current_user)):
    event = _base("customer.identified", user)
    event.update({
        "transaction_id": body.transaction_id,
        "customer_id": body.customer_id,
        "customer_name": body.customer_name,
        "identification_method": "loyalty_card",
    })
    _publish(event)
    return {"event": event}


# ── Add Item ─────────────────────────────────────────────────────────

class AddItemRequest(BaseModel):
    transaction_id: str
    item_name: str = "Whole Milk 2L"
    sku: str = "SKU-MILK-2L"
    quantity: int = 1
    unit_price: float = 3.49
    category: str = "dairy"

@router.post("/transaction/item")
def add_item(body: AddItemRequest, user: dict = Depends(get_current_user)):
    line_total = round(body.unit_price * body.quantity, 2)
    event = _base("item.added", user)
    event.update({
        "transaction_id": body.transaction_id,
        "item_id": f"ITM-{uuid.uuid4().hex[:4].upper()}",
        "sku": body.sku,
        "item_name": body.item_name,
        "category": body.category,
        "quantity": body.quantity,
        "unit_price": body.unit_price,
        "discount": 0,
        "line_total": line_total,
    })
    _publish(event)
    return {"line_total": line_total, "event": event}


# ── Finalize Subtotal ────────────────────────────────────────────────

class SubtotalRequest(BaseModel):
    transaction_id: str
    subtotal: float
    tax_rate: float = 0.08

@router.post("/transaction/subtotal")
def finalize_subtotal(body: SubtotalRequest, user: dict = Depends(get_current_user)):
    tax = round(body.subtotal * body.tax_rate, 2)
    total = round(body.subtotal + tax, 2)
    event = _base("transaction.subtotal", user)
    event.update({
        "transaction_id": body.transaction_id,
        "subtotal": body.subtotal,
        "tax_rate": body.tax_rate,
        "tax": tax,
        "total": total,
        "currency": "USD",
    })
    _publish(event)
    return {"total": total, "tax": tax, "event": event}


# ── Payment ──────────────────────────────────────────────────────────

class PaymentRequest(BaseModel):
    transaction_id: str
    payment_method: str = "card"
    amount_due: float

@router.post("/transaction/pay")
def complete_payment(body: PaymentRequest, user: dict = Depends(get_current_user)):
    event = _base("payment.completed", user)
    event.update({
        "transaction_id": body.transaction_id,
        "payment_method": body.payment_method,
        "amount_due": body.amount_due,
        "amount_tendered": body.amount_due,
        "change_due": 0,
        "currency": "USD",
        "receipt_number": f"RCP-{uuid.uuid4().hex[:8].upper()}",
    })
    _publish(event)
    return {"receipt_number": event["receipt_number"], "event": event}
