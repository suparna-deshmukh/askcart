// L4 "Search or Ask" helpers (update-prompt section 5). Pure client-side,
// zero LLM: decides when typed text reads like a question for the assistant.
const CONV_START = /^(which|what|whats|whats|who|best|should|compare|suggestion|suggest|help|recommend|kaun|kya|batao|chahiye)\b/i;
export function looksConversational(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (s.includes("?")) return true;
  if (CONV_START.test(s)) return true;
  return s.split(/\s+/).filter(Boolean).length >= 7;
}
// Hero Ask-mode placeholder examples (rule-based, persona-agnostic).
export const CHAT_ASK_EXAMPLES = [
  "Compare the top 3 headphones",
  "Which gift is best for a 10 year old?",
  "Is the ₹1,499 watch a fair price?",
];
