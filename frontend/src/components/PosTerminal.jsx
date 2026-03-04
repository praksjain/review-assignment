import React, { useState } from "react";
import { apiClient } from "../api";
import { usePosTerminal } from "../context/PosTerminalContext";

const STEPS = [
  { key: "start",    label: "Start Transaction",  eventType: "transaction.started" },
  { key: "customer", label: "Identify Customer",   eventType: "customer.identified" },
  { key: "items",    label: "Add Items",           eventType: "item.added" },
  { key: "subtotal", label: "Finalize Subtotal",   eventType: "transaction.subtotal" },
  { key: "pay",      label: "Complete Payment",    eventType: "payment.completed" },
];

const CATALOG = [
  { name: "Whole Milk 2L",       sku: "SKU-MILK-2L",   price: 3.49, category: "dairy" },
  { name: "Soy Milk 1L",          sku: "SKU-SOYM-1L",   price: 2.29, category: "dairy" },
  { name: "Free Range Soy Milk 1L", sku: "SKU-SOYM-FR",   price: 4.99, category: "dairy" },
  { name: "Bananas 1kg",         sku: "SKU-BNNA-1KG",  price: 1.89, category: "produce" },
  { name: "Lemons 500g",         sku: "SKU-LEMO-500",  price: 7.49, category: "produce" },
  { name: "Ground Coffee 250g",  sku: "SKU-COFE-250",  price: 5.99, category: "beverages" },
  { name: "Canned Tomatoes 400g", sku: "SKU-TMAT-CAN",  price: 0.99, category: "canned" },
  { name: "Sparkling Water 1L",  sku: "SKU-WATR-1L",   price: 1.19, category: "beverages" },
  { name: "Local Beer 6-pack",  sku: "SKU-BEER-6PK",  price: 9.99, category: "alcohol", ageRestricted: true },
];

const RECOMMENDATION_RULES = {
  "SKU-SOYM-1L": ["SKU-BNNA-1KG"],
  "SKU-SOYM-FR": ["SKU-BNNA-1KG"],
  "SKU-COFE-250": ["SKU-WATR-1L"],
};

export default function PosTerminal() {
  const {
    step,
    setStep,
    txnId,
    setTxnId,
    cart,
    setCart,
    totals,
    setTotals,
    receipt,
    setReceipt,
    eventLog,
    loading,
    setLoading,
    payMethod,
    setPayMethod,
    rules,
    addEvent,
    resetTransaction,
  } = usePosTerminal();

  const [recommendedItems, setRecommendedItems] = useState([]);
  const [itemCounts, setItemCounts] = useState({});

  const findItemsBySku = (skus) => {
    const skuSet = new Set(skus);
    return CATALOG.filter((item) => skuSet.has(item.sku));
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/start", {
        store_id: "STORE-001",
        terminal_id: "T-01",
      });
      setTxnId(data.transaction_id);
      addEvent(data.event);
      setStep(1);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomer = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/customer", {
        transaction_id: txnId,
        customer_id: "LOYALTY-000142",
        customer_name: "Arpan Joshi",
      });
      addEvent(data.event);
      setStep(2);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerLookup = async () => {
    if (!rules?.customerLookup?.enabled) {
      return;
    }
    const mobile = window.prompt("Enter customer's mobile number:");
    if (!mobile) return;
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/customer-lookup", {
        transaction_id: txnId,
        mobile,
      });
      addEvent(data.event);
      setStep(2);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (item) => {
    if (rules?.ageVerification?.enabled && item.ageRestricted) {
      const input = window.prompt("Age verification required. Please enter customer's age:");
      if (input == null) {
        return;
      }
      const age = parseInt(input, 10);
      if (Number.isNaN(age)) {
        alert("Invalid age entered. Please try again.");
        return;
      }
      if (age < (rules.ageVerification.minAge ?? 21)) {
        alert(`Customer must be at least ${rules.ageVerification.minAge ?? 21} years old to purchase this item.`);
        return;
      }
    }
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/item", {
        transaction_id: txnId,
        item_name: item.name,
        sku: item.sku,
        quantity: 1,
        unit_price: item.price,
        category: item.category,
      });
      setCart((prev) => [...prev, { ...item, line_total: data.line_total }]);
      addEvent(data.event);
      if (rules?.fraudDetection?.enabled) {
        const currentCount = itemCounts[item.sku] ?? 0;
        const newCount = currentCount + 1;
        const threshold = rules.fraudDetection.threshold ?? 15;
        setItemCounts((prev) => ({
          ...prev,
          [item.sku]: newCount,
        }));
        if (newCount > threshold) {
          const isFraud = window.confirm(
            `Item "${item.name}" has been added ${newCount} times in this transaction.\n` +
            "Does this look like potential fraud? Click OK for 'Fraud', or Cancel for 'Normal'."
          );
          const decision = isFraud ? "fraud" : "normal";
          try {
            const resp = await apiClient.post("/pos/transaction/fraud-alert", {
              transaction_id: txnId,
              sku: item.sku,
              item_name: item.name,
              count: newCount,
              decision,
            });
            addEvent(resp.data.event);
          } catch (err) {
            // Best-effort; core sale flow should continue
            // eslint-disable-next-line no-alert
            alert("Failed to publish fraud alert: " + (err.response?.data?.detail || err.message));
          }
        }
      }
      if (rules?.purchaseRecommender?.enabled) {
        const extraSkus = RECOMMENDATION_RULES[item.sku] || [];
        const extras = findItemsBySku(extraSkus);
        setRecommendedItems(extras);
      } else {
        setRecommendedItems([]);
      }
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubtotal = async () => {
    const subtotal = cart.reduce((sum, i) => sum + i.line_total, 0);
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/subtotal", {
        transaction_id: txnId,
        subtotal: parseFloat(subtotal.toFixed(2)),
      });
      setTotals({ subtotal: subtotal.toFixed(2), tax: data.tax, total: data.total });
      addEvent(data.event);
      setStep(3);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.post("/pos/transaction/pay", {
        transaction_id: txnId,
        payment_method: payMethod,
        amount_due: totals.total,
      });
      setReceipt(data.receipt_number);
      addEvent(data.event);
      setStep(4);
    } catch (err) {
      alert("Failed: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    resetTransaction();
    setRecommendedItems([]);
    setItemCounts({});
  };

  const cartSubtotal = cart.reduce((sum, i) => sum + i.line_total, 0);

  return (
    <div className="pos-terminal">
      {/* Progress bar */}
      <div className="pos-steps">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`pos-step ${i < step ? "done" : ""} ${i === step ? "active" : ""} ${i > step ? "pending" : ""}`}>
            <span className="step-dot">{i < step ? "✓" : i + 1}</span>
            <span className="step-label">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="pos-body">
        {/* Left: Action panel */}
        <div className="pos-action-panel">
          {step === 0 && (
            <div className="pos-card">
              <h3>Start a New Transaction</h3>
              <p>This will publish a <code>transaction.started</code> event to Kafka.</p>
              <button className="pos-btn primary" onClick={handleStart} disabled={loading}>
                {loading ? "Starting..." : "Start Transaction"}
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="pos-card">
              <h3>Identify Customer</h3>
              <p>Scan loyalty card or look up by mobile — both publish a <code>customer.identified</code> event.</p>
              <div className="pos-identify-actions">
                <button className="pos-btn primary" onClick={handleCustomer} disabled={loading}>
                  {loading ? "Scanning..." : "Scan Loyalty Card"}
                </button>
                {rules?.customerLookup?.enabled && (
                  <button className="pos-btn" onClick={handleCustomerLookup} disabled={loading}>
                    Customer Lookup
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="pos-card">
              <h3>Add Items to Cart</h3>
              <p>Each click publishes an <code>item.added</code> event.</p>
              <div className="pos-catalog">
                {CATALOG.map((item) => (
                  <button
                    key={item.sku}
                    className="pos-item-btn"
                    onClick={() => handleAddItem(item)}
                    disabled={loading}
                  >
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">${item.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
              {rules?.purchaseRecommender?.enabled && recommendedItems.length > 0 && (
                <div className="pos-recommendations">
                  <h4>Recommended add-ons</h4>
                  <p className="pos-recommendations-subtitle">
                    Based on the last item added, you might also suggest:
                  </p>
                  <div className="pos-catalog">
                    {recommendedItems.map((item) => (
                      <button
                        key={item.sku}
                        className="pos-item-btn pos-item-btn-recommendation"
                        onClick={() => handleAddItem(item)}
                        disabled={loading}
                      >
                        <span className="item-name">{item.name}</span>
                        <span className="item-price">${item.price.toFixed(2)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cart.length > 0 && (
                <div className="pos-cart-summary">
                  <p>{cart.length} item(s) — Subtotal: <strong>${cartSubtotal.toFixed(2)}</strong></p>
                  <button className="pos-btn primary" onClick={handleSubtotal} disabled={loading}>
                    {loading ? "Calculating..." : "Finalize Subtotal →"}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="pos-card">
              <h3>Complete Payment</h3>
              <p>Publishes <code>payment.completed</code> event.</p>
              <div className="pos-totals">
                <div className="total-row"><span>Subtotal</span><span>${totals.subtotal}</span></div>
                <div className="total-row"><span>Tax (8%)</span><span>${totals.tax.toFixed(2)}</span></div>
                <div className="total-row total-final"><span>Total</span><span>${totals.total.toFixed(2)}</span></div>
              </div>
              <div className="pos-pay-methods">
                {["card", "cash", "mobile_wallet"].map((m) => (
                  <button
                    key={m}
                    className={`pay-method-btn ${payMethod === m ? "selected" : ""}`}
                    onClick={() => setPayMethod(m)}
                  >
                    {m === "card" ? "💳 Card" : m === "cash" ? "💵 Cash" : "📱 Mobile"}
                  </button>
                ))}
              </div>
              <button className="pos-btn primary" onClick={handlePay} disabled={loading}>
                {loading ? "Processing..." : `Pay $${totals.total.toFixed(2)}`}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="pos-card pos-receipt">
              <h3>Transaction Complete</h3>
              <p className="receipt-id">Receipt: <code>{receipt}</code></p>
              <p className="receipt-txn">Transaction: <code>{txnId.slice(0, 8)}...</code></p>
              <p>All 5 events have been published to Kafka, processed by consumers, and written to the database.</p>
              <p>Switch to the <strong>Event Log</strong> tab to see them.</p>
              <button className="pos-btn" onClick={handleReset}>New Transaction</button>
            </div>
          )}
        </div>

        {/* Right: Live event feed */}
        <div className="pos-event-feed">
          <h3>Live Event Feed</h3>
          {eventLog.length === 0 ? (
            <p className="feed-empty">Events will appear here as you progress through the transaction.</p>
          ) : (
            <div className="feed-list">
              {eventLog.map((evt, i) => (
                <div key={i} className="feed-item">
                  <div className="feed-header">
                    <code className="feed-type">{evt.event_type}</code>
                    <span className="feed-time">{evt._time}</span>
                  </div>
                  <div className="feed-details">
                    {evt.transaction_id && <span>txn: {evt.transaction_id.slice(0, 8)}...</span>}
                    {evt.item_name && <span>{evt.item_name}</span>}
                    {evt.customer_name && <span>{evt.customer_name}</span>}
                    {evt.total && <span>total: ${evt.total}</span>}
                    {evt.payment_method && <span>{evt.payment_method}</span>}
                    {evt.receipt_number && <span>{evt.receipt_number}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
