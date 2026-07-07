#!/usr/bin/env python3
"""Auto-tag imported ChatGPT notes with topic clusters (bilingual EN+RU) for Breastfeeding Art.
Writes topic slugs into each note's frontmatter `tags:` so the knowledge graph clusters by topic
AND basic-memory indexes them for retrieval. Idempotent (recomputes topics each run).
Dry-run by default; --apply rewrites the files.
"""
import os, re, sys, glob
from collections import Counter

KDIR = "/home/hermes/aicontentstudio/studio-data/knowledge/chatgpt"

# topic slug -> keyword stems (lowercased; RU casefolded substrings). Assign up to 3 per note.
TOPICS = {
  "latch-positioning":       ["latch", "positioning", "deep latch", "attachment at breast", "приклад", "захват груд", "поза для корм", "позы для корм", "как прикладыв", "неправильный захват"],
  "milk-supply":             ["milk supply", "low supply", "oversupply", "increase milk", "boost milk", "galactagog", "мало молок", "не хватает молок", "нехватк молок", "много молок", "гиперлакт", "гиполакт", "прилив молок", "количество молок", "лактаци"],
  "pumping-expressing":      ["pumping", "breast pump", "express milk", "expressed milk", "haakaa", "сцежив", "молокоотсос", "сцедить", "сцеживани"],
  "feeding-schedule":        ["feeding schedule", "how often to feed", "on demand", "cluster feed", "feed frequency", "режим корм", "график корм", "частота корм", "по требован", "как часто корм", "каждые 2-3"],
  "weaning":                 ["weaning", "wean off", "stop breastfeeding", "отлуч", "завершение гв", "завершение груд", "отучить от груд", "прекратить корм"],
  "newborn-weight-growth":   ["weight gain", "newborn weight", "growth chart", "premature", "прибавка вес", "набор вес", "вес ребен", "вес малыш", "недоношен", "рост ребен", "перцентил"],
  "engorgement-mastitis":    ["engorge", "mastitis", "blocked duct", "clogged duct", "cracked nipple", "лактостаз", "мастит", "застой молок", "трещин соск", "воспал груд", "закупор"],
  "complementary-feeding":   ["solid food", "complementary feeding", "first foods", "introduce solids", "прикорм", "первый прикорм", "введение прикорм", "докорм"],
  "infant-nutrition":        ["infant nutrition", "supplement", "vitamin d", "iron intake", "питани ребен", "витамин", "добавк", "железо", "рацион малыш", "смесь"],
  "sleep-settling":          ["baby sleep", "night feed", "co-sleep", "settling", "nap schedule", "сон ребен", "сон малыш", "сон месяч", "ночн корм", "ночн сон", "засыпан", "режим сна", "укладыван"],
  "newborn-care":            ["newborn care", "infant care", "colic", "jaundice", "reflux", "уход за новорожд", "колик", "желтуш", "срыгив", "рефлюкс", "купан", "псориаз у груд"],
  "content-planning":        ["content plan", "content calendar", "editorial calendar", "контент-план", "контент план", "план публикац", "рубрикатор", "план контент", "контент на месяц", "контент на"],
  "social-instagram":        ["instagram", "reels", "stories", "social media", "инстаграм", "рилс", "reels", "сторис", "соцсет", "тикток", "публикац в"],
  "copywriting-storytelling":["copywrit", "storytelling", "headline", "caption", "sales copy", "продающий текст", "копирайт", "сторител", "заголов", "текст для пост", "цепляющ", "прогрев"],
  "brand-strategy":          ["brand voice", "brand strategy", "brand identity", "tone of voice", "айдентик", "позициониров", "миссия бренд", "ценност бренд", "уникальн предложен", "бренд"],
  "business-planning":       ["business plan", "revenue", "pricing", "monetiz", "sales funnel", "бизнес-план", "бизнес план", "монетизац", "ценообразов", "продаж", "доход", "воронк", "прайс", "план на 2025", "план на 2026", "vision board"],
  "courses-masterclass":     ["masterclass", "webinar", "curriculum", "lesson plan", "course module", "курс", "мастер-класс", "мк урок", "мк ", "вебинар", " урок", "модул", "обучающ", "программа курс", "марафон"],
  "launch-campaign":         ["product launch", "campaign", "promo", "запуск продукт", "запуск курс", "кампани", "акци", "распродаж", "предзапуск"],
  "audience-engagement":     ["target audience", "audience persona", "engagement", "community", "целевая аудитор", "аватар клиент", "вовлечен", "комьюнит", "подписчик"],
  "mindset-motivation":      ["mindset", "motivation", "self-programming", "confidence", "мышлени", "самопрограмм", "мотивац", "установк на", "выгоран", "уверенност"],
}
TOPIC_SLUGS = set(TOPICS)

def topics_for(text):
    t = text.casefold()
    scored = []
    for slug, kws in TOPICS.items():
        n = sum(1 for kw in kws if kw in t)
        if n: scored.append((n, slug))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [s for _, s in scored[:3]]   # up to 3 strongest topics

def rewrite(raw, topics):
    m = re.match(r'^(---\n)(.*?\n)(---\n)(.*)$', raw, re.S)
    if not m: return None
    o, fm, c, body = m.groups()
    lines = fm.splitlines()
    out, existing, tag_at, i = [], [], None, 0
    while i < len(lines):
        ln = lines[i]
        if re.match(r'^tags:\s*$', ln):                       # block form
            tag_at = len(out); out.append('tags:'); i += 1
            while i < len(lines) and re.match(r'^\s*-\s+', lines[i]):
                existing.append(re.sub(r'^\s*-\s+', '', lines[i]).strip()); i += 1
            continue
        if re.match(r'^tags:\s*\[.*\]\s*$', ln):              # inline form
            tag_at = len(out); out.append('tags:')
            existing = [x.strip() for x in re.match(r'^tags:\s*\[(.*)\]', ln).group(1).split(',') if x.strip()]
            i += 1; continue
        out.append(ln); i += 1
    base = [t for t in existing if t not in TOPIC_SLUGS]       # idempotent: drop old topic tags
    final = base + topics
    items = [f'- {t}' for t in final]
    if tag_at is not None: out = out[:tag_at+1] + items + out[tag_at+1:]
    else: out += ['tags:'] + items
    return o + ('\n'.join(out) + '\n') + c + body

def main():
    apply = "--apply" in sys.argv
    files = sorted(glob.glob(os.path.join(KDIR, "*.md")))
    dist, none, per = Counter(), [], []
    changes = []
    for p in files:
        raw = open(p, encoding="utf-8", errors="replace").read()
        tp = topics_for(raw)
        per.append(len(tp))
        if not tp: none.append(os.path.basename(p)); continue
        for s in tp: dist[s] += 1
        new = rewrite(raw, tp)
        if new and new != raw: changes.append((p, tp, new))

    tot = len(files)
    print(f"=== {tot} notes | topics assigned to {tot-len(none)} ({round(100*(tot-len(none))/tot)}%), no-topic {len(none)} ===")
    print(f"avg topics/note: {round(sum(per)/tot,2)}")
    print("\n--- cluster sizes (notes per topic) ---")
    for slug, c in dist.most_common():
        print(f"  {slug:26} {c:4}  {'#'*min(50, c//3)}")
    print(f"\nno-topic sample: {', '.join(none[:8])}")

    if apply:
        n = 0
        for p, tp, new in changes:
            open(p, "w", encoding="utf-8").write(new); n += 1
        print(f"\nAPPLIED: rewrote {n} notes with topic tags.")
    else:
        # show 2 sample rewritten frontmatters
        for p, tp, new in changes[:2]:
            fm = new.split('---\n')[1]
            print(f"\n----- SAMPLE {os.path.basename(p)} -> {tp} -----\n---\n{fm}---")
        print("\n(dry-run — nothing written. re-run with --apply.)")

if __name__ == "__main__":
    main()
