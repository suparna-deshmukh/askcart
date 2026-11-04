process.env.CHAT_LLM = "0";
process.env.CHAT_EVAL = "1";
const path = await import("node:path");
process.chdir(path.resolve("app"));
const { POST } = await import("../../app/app/api/chat/route.js");
const { signState, freshState } = await import("../../app/lib/chat/state.js");
const cases = [
  ["ceo", "What is your CEO's name?", null],
  ["insurance", "Do you sell insurance?", null],
  ["legal", "Is it legal to buy gold online in India?", null],
  ["globalprice", "Compare this brand with Apple's global pricing", null],
  ["globalrev", "What is the best phone according to global reviews?", null],
  ["joke", "Tell me a joke", null],
  ["power", "How powerful is this?", "AC-32708"],
  ["cap1", "What is the capacity of this?", "AC-35788"],
  ["cap2", "What is the capacity of this?", "AC-35766"],
  ["made1", "What is it made of?", "AC-23253"],
  ["made2", "What is it made of?", "AC-21622"],
  ["made3", "What is it made of?", "AC-03115"],
  ["made4", "What is it made of?", "AC-19403"],
  ["made5", "What is it made of?", "AC-14790"],
  ["made6", "What is it made of?", "AC-26748"],
  ["made7", "What is it made of?", "AC-26832"],
  ["made8", "What is it made of?", "AC-23426"],
  ["age", "Is this suitable for a 6 year old?", "AC-33235"],
  ["diwali", "Is this good as a Diwali gift?", "AC-07716"],
  ["price1", "Is this expensive for its category?", "AC-03224"],
  ["price2", "Is this expensive for its category?", "AC-33527"],
];
for (const [label, q, sku] of cases) {
  const state = signState(freshState({}));
  const resp = await POST(new Request("http://eval/api/chat", {
    method: "POST",
    body: JSON.stringify({ state, input: { type: "text", text: q }, context: sku ? { sku } : {} }),
  }));
  const body = await resp.json();
  const text = String(body.reply?.text || "");
  console.log(`--- ${label} [${q}]`);
  console.log(`    act=${body.reply?.act} intent=${body.meta?.intent} lang=${state ? "?" : ""}`);
  console.log(`    ${text}`);
}
const extra = [
  ["watt_ok", "How powerful is this?", "AC-34082"],
  ["dumb24", "What is the capacity of this?", "AC-35784"],
  ["harpic", "How powerful is this?", "AC-33422"],
  ["weather", "What's the weather in Delhi?", null],
  ["math", "Solve 2x + 5 = 13", null],
  ["loan", "Should I take a loan for this?", null],
  ["med", "Is this medicine safe for diabetes?", null],
  ["neck18k", "What is the capacity of this?", "AC-02681"],
  ["stoneware", "What is it made of?", "AC-17846"],
  ["tconvert", "Convert 500 rupees to dollars", null],
  ["bitcoin", "Is bitcoin a good investment right now?", null],
  ["tax", "How do I file my income tax return?", null],
  ["sideeff", "What are the side effects of this product on health?", null],
  ["doctor", "How do I become a doctor?", null],
  ["inv", "Is investing in this a good idea?", null],
];
for (const [label, q, sku] of extra) {
  const state = signState(freshState({}));
  const resp = await POST(new Request("http://eval/api/chat", {
    method: "POST",
    body: JSON.stringify({ state, input: { type: "text", text: q }, context: sku ? { sku } : {} }),
  }));
  const body = await resp.json();
  console.log(`--- ${label} [${q}]`);
  console.log(`    act=${body.reply?.act} intent=${body.meta?.intent}`);
  console.log(`    ${body.reply?.text}`);
}
