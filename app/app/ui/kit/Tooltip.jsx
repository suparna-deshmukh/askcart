"use client";
export function Tooltip({ tip, children }) {
  return (
    <span className="kit-tip" tabIndex={0} aria-label={tip}>
      {children}
      <span className="kit-tip-pop" role="tooltip">{tip}</span>
    </span>
  );
}
