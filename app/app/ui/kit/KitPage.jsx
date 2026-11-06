"use client";
// Hidden kit reference (?/kit=1) - every component and state, for QA.
import { useState } from "react";
import { Button, IconButton } from "./Button";
import { Chip } from "./Chip";
import { Badge } from "./Badge";
import { Input, Select, Textarea } from "./Input";
import { Overlay } from "./Overlay";
import { ToasterProvider, useToast } from "./Toaster";
import { Tooltip } from "./Tooltip";
import { Skeleton } from "./Skeleton";
import { Rail } from "./Rail";
import { Price } from "./Price";
import { Rating } from "./Rating";
import { QtyStepper } from "./QtyStepper";
import { Tile } from "./Tile";
import { I } from "./Icon";

function Item({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--text-3)", margin: "0 0 12px" }}>{title}</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>{children}</div>
    </div>
  );
}

function Demo() {
  const toast = useToast();
  const [open, setOpen] = useState(null);
  const [qty, setQty] = useState(2);
  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px 80px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Kit reference <span style={{ color: "var(--text-3)", fontWeight: 500, fontSize: 15 }}>(?kit=1 — hidden QA page)</span></h1>
      <Item title="Button — variants × 3 sizes × states">
        {["primary", "secondary", "ink", "ghost", "guide", "danger-ghost"].map((v) => (
          <Button key={v} variant={v}>{v}</Button>
        ))}
        <Button loading>loading</Button>
        <Button disabled>disabled</Button>
        <Button size="sm" iconLeft={<I name="heart" size={16} />}>sm icon</Button>
        <Button size="lg" iconRight={<I name="arrow-right" size={16} />}>lg icon</Button>
      </Item>
      <Item title="IconButton">
        <IconButton name="search" label="Search" />
        <IconButton name="heart" label="Wishlist" badge={3} />
        <IconButton name="bag" label="Cart" badge={12} />
        <IconButton name="x" label="Close" size={40} />
      </Item>
      <Item title="Chip">
        <Chip>default</Chip>
        <Chip variant="selected">selected</Chip>
        <Chip variant="guide">guide</Chip>
        <Chip variant="guide" size="lg">guide lg 44</Chip>
        <Chip variant="removable">removable</Chip>
        <Chip variant="ghost-dashed">ghost-dashed</Chip>
        <Chip count={48}>with count</Chip>
        <Chip disabled>disabled</Chip>
      </Item>
      <Item title="Badge">
        <Badge variant="best">Best match</Badge>
        <Badge variant="close">Close match</Badge>
        <Badge variant="toprated">Top rated</Badge>
        <Badge variant="info">info</Badge>
      </Item>
      <Item title="Form controls">
        <div style={{ width: 260 }}><Input label="Label" placeholder="Placeholder" hint="Helper text" /></div>
        <div style={{ width: 260 }}><Input label="Error" error="This field needs 6 digits" /></div>
        <div style={{ width: 260 }}><Select label="Select" options={["Option A", "Option B", { value: "c", label: "Option C" }]} /></div>
        <div style={{ width: 260 }}><Textarea label="Textarea" placeholder="…" /></div>
      </Item>
      <Item title="Overlay (modal / drawer / sheet)">
        <Button onClick={() => setOpen("modal")}>Open modal</Button>
        <Button variant="secondary" onClick={() => setOpen("right")}>Open drawer</Button>
        <Button variant="secondary" onClick={() => setOpen("left")}>Open drawer left</Button>
        <Button variant="secondary" onClick={() => setOpen("sheet")}>Open sheet</Button>
      </Item>
      <Item title="Toaster">
        <Button variant="secondary" onClick={() => toast({ type: "success", text: "Added · Saree (Maroon)", sub: "₹1,299", action: "View cart", onAction: () => {}, ms: 6000 })}>success + action</Button>
        <Button variant="secondary" onClick={() => toast({ type: "info", text: "Info toast" })}>info</Button>
        <Button variant="secondary" onClick={() => toast({ type: "warning", text: "Daily limit hit — next key in use" })}>warning</Button>
      </Item>
      <Item title="Tooltip">
        <Tooltip tip="Illustrative image"><I name="info" size={18} /></Tooltip>
        <Tooltip tip="4.1 adjusted for rating count (Bayesian)"><span className="kit-rating"><span className="pill good">★ 4.3</span></span></Tooltip>
      </Item>
      <Item title="Skeleton">
        <div style={{ width: 200, display: "grid", gap: 8 }}><Skeleton kind="card" /><Skeleton kind="text" width="60%" /></div>
      </Item>
      <Item title="Price">
        <Price value={1299} size="sm" /><Price value={12999} size="md" from={9999} /><Price value={1499} size="lg" overbudget /><Price value={99999} size="xl" mrp={129999} />
      </Item>
      <Item title="Rating">
        <Rating rating={4.4} count={1234} compact /><Rating rating={3.4} count={220} compact /><Rating rating={2.8} count={12} compact />
        <Rating rating={4.4} count={1234} />
      </Item>
      <Item title="QtyStepper">
        <QtyStepper qty={qty} onDec={() => setQty((q) => Math.max(1, q - 1))} onInc={() => setQty((q) => q + 1)} />
      </Item>
      <Item title="Tile v2 (category themes × sizes)">
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", width: "100%" }}>
          {[
            { category: "AMAZON FASHION", title: "Silk Saree", brand: "Fabindia" },
            { category: "All Electronics", title: "5G Phone", brand: "Samsung" },
            { category: "Amazon Home", title: "Cotton Bedsheet", brand: "IKEA" },
            { category: "All Beauty", title: "Perfume 100ml", brand: "Bella" },
            { category: "Toys & Games", title: "Building Blocks", brand: "Funco" },
            { category: "Sports", title: "Cricket Bat", brand: "SG" },
            { category: "Watches", title: "Analog Watch", brand: "Titan" },
            { category: "Amazon Home", title: "Mixer Grinder 750W", brand: "Preethi" },
          ].map((it, i) => <Tile key={i} item={it} size={96} />)}
        </div>
      </Item>
      <Item title="Rail">
        <div style={{ width: "100%" }}>
          <Rail title="Rail demo" sub="8 picks" label="Rail demo">
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{ width: 180, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, display: "grid", gap: 8 }}>
                <Tile item={{ category: "Amazon Home", title: "Lamp " + i, brand: "HomeCo" }} size={156} className="" />
                <span style={{ fontSize: 13, fontWeight: 600 }}>Lamp {i + 1}</span>
                <Price value={599 + i * 100} size="sm" />
              </div>
            ))}
          </Rail>
        </div>
      </Item>
      {open && <Overlay variant={open} label="Demo overlay" onClose={() => setOpen(null)}>
        <div style={{ padding: 24 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Demo {open}</h3>
          <p style={{ color: "var(--text-2)", marginBottom: 16 }}>Focus is trapped; Esc or backdrop closes; focus returns to the opener.</p>
          <Button onClick={() => setOpen(null)}>Close</Button>
        </div>
      </Overlay>}
    </div>
  );
}

export function KitPage() {
  return <ToasterProvider><Demo /></ToasterProvider>;
}
