"""End-to-end smoke test for the renamed FitnessBuddy API.

Exercises /fitness_buddy/invoke, /fitness_buddy/stream and /history on ONE thread across
several sections, then checks persistence in Supabase under agent_id='fitness_buddy'
(the same filter the Section Viewer uses) and that a pre-rename conversation still loads.

Usage (backend running):
    uv run python scripts/api_smoke_test.py                       # local, http://localhost:8080
    uv run python scripts/api_smoke_test.py https://fitnessbuddy-chris.fly.dev
"""

import json
import os
import sys
import time

import httpx
from dotenv import load_dotenv

load_dotenv()
BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
AGENT = "fitness_buddy"
USER_ID = 9001  # dedicated test user so test rows are easy to find/delete
client = httpx.Client(timeout=180)
results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'}  {name}  {detail}")


def stream(message: str, thread_id: str) -> dict:
    """POST /stream and collect the SSE events."""
    tokens, meta_thread, section = [], None, None
    body = {"message": message, "user_id": USER_ID, "thread_id": thread_id, "stream_tokens": True}
    with client.stream("POST", f"{BASE}/{AGENT}/stream", json=body) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line.startswith("data: ") or line == "data: [DONE]":
                continue
            ev = json.loads(line[6:])
            if ev.get("type") == "token":
                tokens.append(ev["content"])
            elif ev.get("type") == "metadata":
                meta_thread = ev["content"].get("thread_id")
            elif ev.get("type") == "section":
                section = ev["content"]
    return {"text": "".join(tokens), "thread_id": meta_thread, "section": section}


print(f"Target: {BASE}\n")

# 1) /invoke starts a new thread (Goals)
r = client.post(f"{BASE}/{AGENT}/invoke", json={
    "message": "I want to lose some fat and build upper-body muscle for my wedding in about 6 months.",
    "user_id": USER_ID,
})
check("/invoke returns 200", r.status_code == 200, f"status={r.status_code}")
inv = r.json()
thread = inv.get("thread_id")
check("/invoke returns a thread_id + AI reply", bool(thread) and bool(inv.get("output", {}).get("content")),
      f"thread_id={thread}")

# 2) /stream continues the SAME thread through further sections
turns = [
    "I'm 25, 183cm, 85kg, male. No injuries, but my lungs are still recovering from COVID.",
    "I'm getting back into training after a long break.",
    "About 4 days a week, 45-55 minutes, at a regular gym with barbells, dumbbells and machines.",
]
sections_seen = []
for i, msg in enumerate(turns, 1):
    s = stream(msg, thread)
    check(f"/stream turn {i} streamed tokens", len(s["text"]) > 0, f"{len(s['text'])} chars")
    check(f"/stream turn {i} kept the same thread_id", s["thread_id"] == thread, f"metadata={s['thread_id']}")
    if s["section"]:
        sections_seen.append(s["section"].get("name"))
check("conversation advanced past the first section",
      any(n and n != "Goals" for n in sections_seen), f"sections={sections_seen}")

# 3) /history returns the whole thread
h = client.post(f"{BASE}/history", json={"thread_id": thread})
check("/history returns 200", h.status_code == 200, f"status={h.status_code}")
msgs = h.json().get("messages", []) if h.status_code == 200 else []
humans = [m["content"] for m in msgs if m.get("type") == "human"]
check("/history contains every user turn", len(humans) >= 1 + len(turns), f"{len(msgs)} messages, {len(humans)} human")
check("/history contains the first (/invoke) message", any("wedding" in m for m in humans))

# 4) Persistence under the new agent_id (same filter as the Section Viewer)
url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if url and key:
    from supabase import create_client

    sb = create_client(url, key)
    time.sleep(1)
    rows = sb.table("section_states").select("section_id,status,agent_id") \
        .eq("thread_id", thread).eq("agent_id", AGENT).execute().data
    check("section_states written under agent_id='fitness_buddy'", len(rows) > 0,
          f"{[(r['section_id'], r['status']) for r in rows]}")
    stale = sb.table("section_states").select("id", count="exact").neq("agent_id", AGENT).execute().count
    check("no rows left under old agent IDs", stale == 0, f"{stale} stale rows")

    # 5) A pre-rename conversation still loads with the new key.
    # Pick the oldest real conversation that has BOTH section rows and a saved plan
    # (some plan rows, e.g. 'pr5-demo', were written by scripts and have no sections).
    plans = sb.table("business_plans").select("user_id,thread_id,updated_at") \
        .neq("user_id", USER_ID).order("updated_at", desc=False).limit(50).execute().data
    picked = None
    for p in plans:
        secs = sb.table("section_states").select("section_id") \
            .eq("thread_id", p["thread_id"]).eq("agent_id", AGENT).execute().data
        if secs:
            picked = (p, secs)
            break
    if picked:
        o, old_sections = picked
        check("pre-rename sections visible under the new agent_id", True,
              f"thread={o['thread_id'][:8]} · {len(old_sections)} sections · last updated {o['updated_at'][:10]}")
        bp = client.get(f"{BASE}/business_plan/{AGENT}", params={"user_id": o["user_id"], "thread_id": o["thread_id"]})
        check("same pre-rename conversation's plan loads via /business_plan/fitness_buddy",
              bp.status_code == 200, f"status={bp.status_code}")
    else:
        check("found a pre-rename conversation with sections + plan", False,
              "no old thread has both section rows and a plan")
else:
    print("SKIP  Supabase checks (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set)")

passed = sum(ok for _, ok, _ in results)
print(f"\n{passed}/{len(results)} checks passed · thread_id={thread}")
sys.exit(0 if passed == len(results) else 1)
