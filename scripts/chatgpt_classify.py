#!/usr/bin/env python3
"""Classify imported ChatGPT notes for Breastfeeding Art.
Keep-net = Brand + content craft (EN+RU). Borderline -> KEEP. Dropped -> archived (not deleted).
Dry-run by default (no file moves); pass --apply to move DROPs to the archive dir.
"""
import os, re, sys, glob, json, shutil

KDIR = "/home/hermes/aicontentstudio/studio-data/knowledge/chatgpt"
ARCHIVE = "/home/hermes/aicontentstudio/studio-data/chatgpt-archive"

# hand-rescued from the weak bucket: genuinely on-topic infant-care / mom-support chats
RESCUE = {
    "untitled-689c5edd.md",  # Могут ли младенцы скучать (can infants get bored)
    "untitled-6967dd45.md",  # Положительное самопрограммирование (mindset)
    "untitled-69f07fe7.md",  # Псориаз у грудных детей (psoriasis in breastfed infants)
    "untitled-c3ba45cb.md",  # Выбор игрушек для младенцев (infant toys)
    "untitled-cb3500f2.md",  # Поддержка для мам (support for moms)
}

# --- keyword tiers (all lowercase; substring/stem match; RU casefolded) ---
STRONG = [  # unambiguous breastfeeding domain (EN)
    "breastfeed", "breast milk", "breastmilk", "lactat", "colostrum", "colostr",
    "engorge", "mastitis", "milk supply", "letdown", "let-down", "oversupply",
    "undersupply", "cluster feed", "tandem feed", "weaning", "latch on", "latching",
    "pumping milk", "express milk", "expressed milk", "milk stash", "wet nurse",
    "nipple shield", "areola", "milk duct", "galactagogue", "haakaa",
    # RU breastfeeding
    "грудное вскармливани", "грудное молоко", "лактаци", "сцеживани", "молозиво",
    "прикорм", "мастит", "послеродов", "лактостаз", "докорм", "гв ", "по требованию",
]
CONTENT = [  # content/marketing craft (EN)
    "content plan", "content calendar", "content strateg", "marketing", "instagram",
    "social media", "caption", "copywrit", "brand voice", "brand strateg", "campaign",
    "hashtag", "carousel", "newsletter", "email marketing", "funnel", "call to action",
    " cta", "headline", "tagline", "positioning", "influencer", "launch plan", "ad copy",
    "advertis", "engagement rate", "reel", "content pillar", "editorial calendar",
    "value proposition", "audience persona", "brand identity", "post idea",
    # RU content/marketing
    "контент-план", "контент план", "контент", "маркетинг", "инстаграм", "соцсет",
    "копирайт", "бренд", "кампани", "хэштег", "хештег", "воронк", "аудитори",
    "вовлечён", "вовлечен", "рассылк", "сторис", "рекламн", "продвижен", "заголов",
]
WEAK = [  # maternal/infant context — one alone = borderline (kept per user), 2+ = solid
    "breast", "nipple", "newborn", "postnatal", "infant", "nursing", "pump", "milk",
    "baby", "babies", "mother", "motherhood", "maternal", "doula", "midwife", "pregnan",
    "parenting", "feeding schedule",
    # RU
    "малыш", "ребёнок", "ребенок", "младенец", "молоко", "кормлени", "грудь",
    "мама", "материнств", "соск", "беременн", "роды", "родил",
]

def has_cyrillic(s): return bool(re.search(r"[Ѐ-ӿ]", s))

def matches(text, terms):
    return sorted({t.strip() for t in terms if t in text})

def classify(text):
    t = text.casefold()
    s = matches(t, STRONG); c = matches(t, CONTENT); w = matches(t, WEAK)
    if s or c:
        return "keep-strong", s + c
    if len(w) >= 2:
        return "keep-strong", w        # 2+ maternal terms = solid, not borderline
    if len(w) == 1:
        return "keep-weak", w          # borderline -> KEEP (user's choice), flagged
    return "drop", []

def read_note(p):
    with open(p, "r", encoding="utf-8", errors="replace") as f:
        raw = f.read()
    title = ""
    m = re.search(r"^title:\s*(.+)$", raw, re.M)
    if m: title = m.group(1).strip()
    # strip frontmatter for language check on the actual conversation
    body = re.split(r"\n---\n", raw, maxsplit=1)
    body = body[1] if len(body) > 1 else raw
    return title, raw, body

def main():
    apply = "--apply" in sys.argv
    files = sorted(glob.glob(os.path.join(KDIR, "*.md")))
    buckets = {"keep-strong": [], "keep-weak": [], "drop": []}
    for p in files:
        bn = os.path.basename(p)
        title, raw, body = read_note(p)
        verdict, why = classify(raw)
        if verdict == "keep-weak" and bn in RESCUE:   # promote hand-rescued notes
            verdict = "keep-strong"
        lang = "RU" if has_cyrillic(body) else "EN"
        buckets[verdict].append((bn, title or "(untitled)", lang, why[:6]))

    tot = len(files)
    ks, kw, dr = len(buckets["keep-strong"]), len(buckets["keep-weak"]), len(buckets["drop"])
    def langcount(b):
        ru = sum(1 for x in b if x[2] == "RU"); return f"{len(b)-ru} EN / {ru} RU"
    print(f"=== {tot} notes ===")
    print(f"KEEP (strong): {ks:>4}   [{langcount(buckets['keep-strong'])}]")
    print(f"KEEP (weak/borderline): {kw:>4}   [{langcount(buckets['keep-weak'])}]")
    print(f"DROP -> archive: {dr:>4}   [{langcount(buckets['drop'])}]")
    print(f"--> KEEP {ks} ({round(100*ks/tot)}%)  |  ARCHIVE {kw+dr} ({round(100*(kw+dr)/tot)}%)  [weak {kw} + off-topic {dr}]")

    def sample(name, n=12):
        print(f"\n----- {name} (sample {n}) -----")
        for fn, ti, lang, why in buckets[name][:n]:
            ws = (" · " + ",".join(why)) if why else ""
            print(f"  [{lang}] {ti[:52]:52}{ws}")
    sample("keep-strong"); sample("keep-weak"); sample("drop")

    # write full manifest for the record (next to studio-data, gitignored)
    man = os.path.join(os.path.dirname(os.path.dirname(KDIR)), "chatgpt-classify-manifest.json")
    with open(man, "w") as f:
        json.dump({k: [list(x) for x in v] for k, v in buckets.items()}, f, ensure_ascii=False, indent=1)
    print(f"\nfull manifest -> {man}")

    if apply:
        os.makedirs(ARCHIVE, exist_ok=True)
        moved = 0
        for fn, *_ in buckets["drop"] + buckets["keep-weak"]:   # archive off-topic + non-rescued weak
            src = os.path.join(KDIR, fn); dst = os.path.join(ARCHIVE, fn)
            if os.path.exists(src): shutil.move(src, dst); moved += 1
        kept = len(glob.glob(os.path.join(KDIR, "*.md")))
        print(f"\nAPPLIED: archived {moved} notes -> {ARCHIVE}   |   {kept} notes remain in the knowledge base")
    else:
        print("\n(dry-run — nothing moved. re-run with --apply to archive the weak + off-topic sets.)")

if __name__ == "__main__":
    main()
