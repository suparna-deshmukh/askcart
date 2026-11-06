"use client";
import { Loader2 } from "lucide-react";
import { I } from "./Icon";

export function Button({ variant = "primary", size = "md", loading = false, iconLeft, iconRight, className = "", children, disabled, type = "button", ...rest }) {
  const v = { primary: "btn-primary", secondary: "btn-secondary", ink: "btn-ink", ghost: "btn-ghost", guide: "btn-guide", "danger-ghost": "btn-danger-ghost" }[variant] || "btn-primary";
  const s = { sm: "btn-sm", md: "btn-md", lg: "btn-lg" }[size] || "btn-md";
  return (
    <button type={type} className={`btn ${v} ${s} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : iconLeft}
      <span>{children}</span>
      {iconRight}
    </button>
  );
}

export function IconButton({ name, size = 44, className = "", badge, label, filled, ...rest }) {
  return (
    <button type="button" className={`iconbtn ${size === 40 ? "sm" : ""} ${className}`} aria-label={label} title={rest.title} {...rest}>
      <I name={name} size={size === 40 ? 19 : 22} filled={filled} />
      {badge != null && badge > 0 && <span className="icbadge">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
}
