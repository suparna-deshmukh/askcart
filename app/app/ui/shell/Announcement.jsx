"use client";
// 36px rotating announcement bar (scrolls away, not sticky). Session dismiss.
import { useEffect, useState } from "react";
import { I } from "../kit/Icon";
import { t } from "../../lib/i18n";

export function Announcement({ festival, days, lang }) {
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const R = "₹1,000 to ₹10,000";
  const msgs = [
    festival
      ? t(lang, days === 0 ? "annToday" : days < 0 ? "annAgo" : "annFestival", { festival: festival, n: Math.abs(days), r: R })
      : t(lang, "announce1"),
    t(lang, "trust2"),
    t(lang, "announce3"),
  ];
  useEffect(() => {
    try { if (sessionStorage.getItem("askcart_announce_dismissed") === "1") setDismissed(true); } catch {}
  }, []);
  useEffect(() => {
    if (dismissed) return;
    const id = setInterval(() => setI((x) => (x + 1) % 3), 5000);
    return () => clearInterval(id);
  }, [dismissed]);
  if (dismissed) return null;
  return (
    <div className="announce" role="region" aria-label="Announcements">
      <div className="announce-in" key={i}>{msgs[i]}</div>
      <button className="announce-x" aria-label="Dismiss announcements"
              onClick={() => { try { sessionStorage.setItem("askcart_announce_dismissed", "1"); } catch {} setDismissed(true); }}>
        <I name="x" size={13} />
      </button>
    </div>
  );
}
