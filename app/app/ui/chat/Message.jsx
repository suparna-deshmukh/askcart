"use client";
// One chat message: text / product cards / compare table / notice / question.
import { ProductMini } from "./ProductMini";
import { QuickReplies } from "./QuickReplies";
import { Feedback } from "./Feedback";
import { t } from "../../lib/i18n";

function CompareTable({ rows, lang }) {
  // Data-derived marks only: lowest price and highest rating get a check.
  const bestPrice = rows.length ? Math.min(...rows.map((r) => r.price)) : null;
  const bestRating = rows.length ? Math.max(...rows.map((r) => r.rating)) : null;
  return (
    <div className="cht-compare">
      <table>
        <thead>
          <tr><th>{t(lang, "chtItem")}</th><th>{t(lang, "chtPriceH")}</th><th>{t(lang, "chtRatingH")}</th><th>{t(lang, "chtSpecs")}</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku}>
              <td className="first">{r.title}</td>
              <td className="num">{r.price === bestPrice && rows.length > 1 ? <span className="cht-best">✓ </span> : null}₹{r.price.toLocaleString("en-IN")}</td>
              <td className="num">{r.rating === bestRating && rows.length > 1 ? <span className="cht-best">✓ </span> : null}★ {r.rating} ({r.num_ratings})</td>
              <td>{r.specs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Message({ lang, m, latest, busy, onChip, onAdd, onOpen, onFeedback, feedbackDone, onWish, wished }) {
  if (m.role === "user") {
    return <div className="cht-msg cht-msg-user">{m.text}</div>;
  }
  if (m.kind === "thinking") {
    return <div className="cht-msg"><span className="cht-typing" aria-label={t(lang, "chtTyping")}><i /><i /><i /></span></div>;
  }
  if (m.role === "system") {
    return (
      <div className="cht-msg cht-msg-err" role="status">
        {m.error ? <><span>{t(lang, "chtErr")} </span><button className="cht-retry" onClick={m.onRetry}>{t(lang, "chtRetry")}</button></> : m.text}
      </div>
    );
  }
  const products = (m.components || []).filter((c) => c.kind === "products");
  const compare = (m.components || []).find((c) => c.kind === "compare");
  const notices = (m.components || []).filter((c) => c.kind === "notice");
  const question = (m.components || []).find((c) => c.kind === "question");
  const interactive = latest && !busy;
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 10, maxWidth: "86%" }}>
      <div className="cht-msg" style={{ marginBottom: 4 }}>{m.text}</div>
      {notices.map((n, i) => <div key={"n" + i} className="cht-notice info">{n.text}</div>)}
      {question && (
        <div className="cht-qbox" role="group" aria-label={question.text}>
          <div className="cht-qbox-eyebrow">{t(lang, "qEyebrow")}</div>
          <div className="cht-qbox-q">{question.text}</div>
          <QuickReplies chips={m.chips} disabled={!interactive} onChip={onChip} />
        </div>
      )}
      {!question && m.chips && m.chips.length > 0 && (
        <QuickReplies chips={m.chips} disabled={!interactive} onChip={onChip} />
      )}
      {products.map((p, pi) => p.items.map((it, ii) => (
        <ProductMini lang={lang} key={it.sku + pi} item={it} pos={ii + 1}
                     onAdd={(x, pos) => { onAdd(x, pos); }}
                     onOpen={(x, pos) => onOpen(x, pos)}
                     onWish={onWish} wished={wished ? wished.includes(it.sku) : false} />
      )))}
      {compare && <CompareTable lang={lang} rows={compare.rows} />}
      <Feedback lang={lang} m={m} latest={latest} disabled={!interactive || !!feedbackDone[m.id]} onFeedback={onFeedback} />
    </div>
  );
}
