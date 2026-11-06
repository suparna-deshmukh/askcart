"use client";
export function QtyStepper({ qty, onDec, onInc, min = 1 }) {
  return (
    <span className="kit-qty" role="group" aria-label="Quantity">
      <button aria-label="Decrease quantity" onClick={onDec} disabled={qty <= min}>−</button>
      <span aria-live="polite">{qty}</span>
      <button aria-label="Increase quantity" onClick={onInc}>+</button>
    </span>
  );
}
