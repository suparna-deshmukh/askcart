"""
E3 Eval v2 - Qwen relevance judge for top-3 per query per arm.
Single LLM judge, thinking off, batched. Verdicts: R / P / I.
Writes eval/evalv2/results/judged.jsonl (qid+arm keyed; re-runs skip).

Token budget note: ~24 batch calls (~30k tokens incl. thinking-off overhead).
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE.parent.parent / "extractor"))
from llm_client import chat, is_available  # noqa: E402




OUT = BASE / "results"
BATCH = 25

PROMPT = """You judge search-result relevance for an Indian e-commerce demo catalogue.
For EACH numbered item answer exactly one letter:
R = relevant: this is the kind of product the shopper asked for
P = partial: related but not the product asked for (accessory, similar-but-different product, brand-only match, only a few words match)
I = irrelevant: unrelated to the query
Notes: for budget-only or "gift for X" queries, any plausible gift-able product within the stated budget is R. "saree" -> a saree is R, a kurti is P. A digital saxophone for "saxophone" is R.
Reply with ONLY one line per group, no JSON, in the given order:
<qid>:<arm> <letter1> <letter2> <letter3>
Example: e3_001:a R P I"""


def main():
    if not is_available():
        print("LLM unavailable"); return
    raw = [json.loads(l) for l in (OUT / "raw.jsonl").read_text().splitlines() if l.strip()]
    judged_path = OUT / "judged.jsonl"
    judged = {}
    if judged_path.exists():
        for l in judged_path.read_text().splitlines():
            if l.strip():
                d = json.loads(l)
                judged[f"{d['qid']}:{d['arm']}"] = d["verdicts"]
    jobs = []
    for r in raw:
        for arm in ("a", "b"):
            key = f"{r['id']}:{arm}"
            if key not in judged and r[arm]["top3"]:
                jobs.append((key, r))
    print(f"to judge: {len(jobs)} (of {2*len(raw)})")
    f = open(judged_path, "a")
    for i in range(0, len(jobs), BATCH):
        batch = jobs[i:i + BATCH]
        lines = []
        for j, (key, r) in enumerate(batch, 1):
            arm = key.split(":")[1]
            for k, t in enumerate(r[arm]["top3"], 1):
                lines.append(f'{j}.{k} [{key}] q="{r["query"]}" | {t["title"][:80]} | Rs{t["price"]} | {t["category"]}')
        import re as _re
        msgs = [{"role": "user", "content": PROMPT + "\n\n" + "\n".join(lines)}]
        for attempt in (1, 2):
            try:
                text, model = chat(msgs, temperature=0.0, max_tokens=600, thinking=False)
                got = {}
                # format 1 (observed): numbered verdicts "j.k: X" in input order
                for m in _re.finditer(r"^\s*(\d+)\.(\d+)\s*:?\s+([RPIU])\s*$", text, _re.M):
                    j, k, letter = int(m.group(1)), int(m.group(2)), m.group(3)
                    if 1 <= j <= len(batch):
                        got.setdefault(batch[j - 1][0], []).append(letter)
                # format 2: one line per item, echoing "[qid:arm]" and ending with the letter
                for m in _re.finditer(r"\[(e3_\d{3}:[ab])\][^\n]*?\b([RPIU])\s*$", text, _re.M):
                    got.setdefault(m.group(1), []).append(m.group(2))
                # format 3 (fallback): one line per group: "qid:arm R P I"
                if len(got) < len(batch) // 2:
                    got2 = {}
                    for m in _re.finditer(r"(e3_\d{3}:[ab])\s+((?:[RPIU]\s*){1,5})", text):
                        got2[m.group(1)] = m.group(2).split()
                    if len(got2) > len(got):
                        got = got2
                if len(got) == len(batch):
                    break
            except Exception:
                got = {}
        for key, r in batch:
            norm = got.get(key) or ["U"] * len(r[arm]["top3"])
            norm = [(x or "U")[0].upper() if (x or "U")[0].upper() in "RPIU" else "U" for x in norm]
            norm = (norm + ["U"] * len(r[arm]["top3"]))[: len(r[arm]["top3"])]
            f.write(json.dumps({"qid": r["id"], "arm": key.split(":")[1], "verdicts": norm}) + "\n")
            f.flush()
        print(f"batch {i//BATCH + 1}/{(len(jobs)+BATCH-1)//BATCH} ok", flush=True)
    f.close()
    print("judging done")


if __name__ == "__main__":
    main()
