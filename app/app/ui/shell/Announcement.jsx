"use client";
// 36px rotating announcement bar (scrolls away, not sticky). Session dismiss.
import { useEffect, useState } from "react";
import { I } from "../kit/Icon";

export function Announcement({ festival, days }) {
  const [i, setI] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const msgs = [
    festival
      ? <>{festival} is {days === 0 ? "today" : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days < 0 ? "ago" : "away"}`} · gifts under <b>₹1,000 to ₹10,000</b></>
      : <>Not sure what to buy? Describe it, we ask <b>one smart question</b>.</>,
    <>Hindi · Hinglish · English</>,
    <>Demo store · checkout is simulated, <b>nothing is charged</b></>,
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
