"""§ social research — run the last30days skill and KEEP ONLY what's relevant to the topic.

The skill ranks candidates by TREND/engagement, not by relevance to the query, so for a niche or
non-English topic it happily returns whatever is trending on Reddit right now (e.g. VPN/gaming posts
for a breastfeeding topic). That noise then gets injected into research as "current discussion".

Fix: after the skill runs, drop any candidate/cluster that shares no meaningful term with the topic.
Better to return nothing (research falls back to web sources) than to ground a post in junk.
Stdlib only; shared by the worker (auto-pull) and the agent's social_pulse tool.
"""
import json
import os
import re
import subprocess

_L30D = "/opt/data/skills/research/last30days/scripts/last30days.py"

# Common, low-signal words (EN + RU) that must not count as topic relevance.
_STOP = set((
    "the a an and or of to in for on with about that this which what why how is are be was were it as "
    "you your they them their our we i my me do does did not no yes can could would should will just "
    "самая самый самое большая большой больше что чтобы который которая которую которые как почему для "
    "это этот эта эти все весь вся уже или но да нет можно надо есть быть был была было были при по из "
    "от до над под про так там тут где когда кто чем чём ещё еще их его её ее мой моя мои наш ваша ваши"
).split())


def _tokens(text):
    """Significant terms, stemmed to a 5-char prefix so RU inflections still match (беременных≈беременн)."""
    toks = re.findall(r"[^\W\d_]+", (text or "").lower(), flags=re.UNICODE)
    return {t[:5] for t in toks if len(t) >= 4 and t not in _STOP}


def _relevant(topic_toks, *texts):
    if not topic_toks:
        return True  # no usable topic terms → don't over-filter
    return bool(topic_toks & _tokens(" ".join(t or "" for t in texts)))


def pull(topic, sources="reddit", timeout=240):
    """Returns {topic, sources, clusters, freshness, range, text} of ON-TOPIC discussion, or None."""
    topic = (topic or "").strip()
    if not topic or not os.path.exists(_L30D):
        return None
    try:
        r = subprocess.run(["python3", _L30D, topic, "--search", sources, "--quick", "--emit", "json"],
                           capture_output=True, text=True, timeout=timeout, cwd=os.path.dirname(_L30D))
        data = json.loads(r.stdout or "{}")
    except Exception:  # noqa: BLE001 — research is best-effort; never raise
        return None

    topic_toks = _tokens(topic)
    cands = data.get("ranked_candidates") or []
    clusters = []
    dropped = 0
    for c in (data.get("clusters") or [])[:10]:
        cid = c.get("cluster_id")
        items = []
        for cand in cands:
            if cand.get("cluster_id") != cid:
                continue
            title = cand.get("title") or ""
            snip = cand.get("snippet") or ""
            if not _relevant(topic_toks, title, snip):
                dropped += 1
                continue  # off-topic trending noise
            meta = cand.get("metadata") or {}
            items.append({
                "source": cand.get("source") or (cand.get("sources") or [None])[0],
                "title": title[:160],
                "url": cand.get("url"),
                "snippet": snip[:240],
                "date": meta.get("date") or meta.get("created") or meta.get("created_utc") or meta.get("published"),
                "score": round(float(cand.get("final_score") or cand.get("score") or 0), 1),
            })
            if len(items) >= 4:
                break
        # keep the cluster only if it has on-topic items (or its own theme is clearly on-topic)
        if not items:
            continue
        clusters.append({"theme": (c.get("title") or "")[:140],
                         "score": round(float(c.get("score") or 0), 1),
                         "sources": c.get("sources") or [], "items": items})
        if len(clusters) >= 6:
            break

    if not clusters:
        return None  # all noise → no pulse (research leans on web sources)

    lines = []
    for cl in clusters:
        lines.append(f"- {cl['theme']}")
        for it in cl["items"]:
            lines.append(f"    · [{it['source']}] {it['title']} {it.get('url') or ''}")
    return {"topic": topic, "sources": sources, "clusters": clusters,
            "freshness": (data.get("warnings") or []) + ([f"dropped {dropped} off-topic posts"] if dropped else []),
            "range": [data.get("range_from"), data.get("range_to")],
            "text": "\n".join(lines)[:4000]}
