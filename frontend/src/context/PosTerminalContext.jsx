import React, { createContext, useContext, useState } from "react";

const PosTerminalContext = createContext(null);

export function PosTerminalProvider({ children }) {
  const [step, setStep] = useState(0);
  const [txnId, setTxnId] = useState(null);
  const [cart, setCart] = useState([]);
  const [totals, setTotals] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [eventLog, setEventLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [payMethod, setPayMethod] = useState("card");
  const [rules, setRules] = useState({
    ageVerification: {
      enabled: false,
      minAge: 21,
    },
    purchaseRecommender: {
      enabled: false,
    },
    customerLookup: {
      enabled: true,
    },
    fraudDetection: {
      enabled: false,
      threshold: 15,
    },
  });

  const addEvent = (evt) => {
    setEventLog((prev) => [{ ...evt, _time: new Date().toLocaleTimeString() }, ...prev]);
  };

  const resetTransaction = () => {
    setStep(0);
    setTxnId(null);
    setCart([]);
    setTotals(null);
    setReceipt(null);
    setEventLog([]);
    setPayMethod("card");
  };

  const value = {
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
    setEventLog,
    loading,
    setLoading,
    payMethod,
    setPayMethod,
    rules,
    setRules,
    addEvent,
    resetTransaction,
  };

  return (
    <PosTerminalContext.Provider value={value}>
      {children}
    </PosTerminalContext.Provider>
  );
}

export function usePosTerminal() {
  const ctx = useContext(PosTerminalContext);
  if (!ctx) {
    throw new Error("usePosTerminal must be used within PosTerminalProvider");
  }
  return ctx;
}
