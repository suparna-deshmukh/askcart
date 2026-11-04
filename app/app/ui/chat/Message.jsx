"use client";
// One chat message: text / product cards / compare table / notice / question.
import { ProductMini } from "./ProductMini";
import { QuickReplies } from "./QuickReplies";
import { Feedback } from "./Feedback";

function CompareTable({ rows }) {
  return (
    <div className="cht-compare">
      <table>
        <thead>
          <tr><th>Item</th><th>Price</th><th>Rating</th><th>Specs</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sku}>
              <td>{r.title}</td>
              <td className="num">₹{r.price.toLocaleString("en-IN")}</td>
              <td className="num">★ {r.rating} ({r.num_ratings})</td>
              <td>{r.specs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Message({ m, latest, busy, onChip, onAdd, onOpen, onFeedback, feedbackDone }) {
  if (m.role === "user") {
    return <div className="cht-msg cht-msg-user">{m.text}</div>;
  }
  if (m.kind === "thinking") {
    return <div className="cht-msg"><span className="cht-typing" aria-label="Assistant is typing"><i /><i /><i /></span></div>;
  }
  if (m.role === "system") {
    return (
      <div className="cht-msg cht-msg-err" role="status">
        {m.error ? <><span>Couldn't reach AskCart. </span><button className="cht-retry" onClick={m.onRetry}>Retry</button></> : m.text}
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
          <div className="cht-qbox-eyebrow">Quick question</div>
          <div className="cht-qbox-q">{question.text}</div>
          <QuickReplies chips={m.chips} disabled={!interactive} onChip={onChip} />
        </div>
      )}
      {!question && m.chips && m.chips.length > 0 && (
        <QuickReplies chips={m.chips} disabled={!interactive} onChip={onChip} />
      )}
      {products.map((p, pi) => p.items.map((it, ii) => (
        <ProductMini key={it.sku + pi} item={it} pos={ii + 1}
                     onAdd={(x, pos) => { onAdd(x, pos); }}
                     onOpen={(x, pos) => onOpen(x, pos)} />
      )))}
      {compare && <CompareTable rows={compare.rows} />}
      <Feedback m={m} latest={latest} disabled={!interactive || !!feedbackDone[m.id]} onFeedback={onFeedback} />
    </div>
  );
}
