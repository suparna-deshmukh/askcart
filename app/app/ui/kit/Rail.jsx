"use client";
import { useRef } from "react";
import { I } from "./Icon";

export function Rail({ title, sub, action, children, label }) {
  const ref = useRef(null);
  const scroll = (dir) => { const el = ref.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" }); };
  return (
    <section className="kit-rail" role="region" aria-label={label || title}>
      <div className="kit-rail-head">
        <h3>{title}</h3>
        {sub && <span className="sub">{sub}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {action}
          <button className="iconbtn sm" aria-label="Scroll back" onClick={() => scroll(-1)}><I name="chevron-left" size={18} /></button>
          <button className="iconbtn sm" aria-label="Scroll forward" onClick={() => scroll(1)}><I name="chevron-right" size={18} /></button>
        </span>
      </div>
      <div className="kit-rail-scroll" ref={ref}>{children}</div>
    </section>
  );
}
