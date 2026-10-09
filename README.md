# FitnessBuddy 🏋️

A conversational AI coach that interviews you across five structured sections and turns your
answers into a personalized **training + nutrition plan**. Built as a stateful agent with
**LangGraph**, served by **FastAPI**, persisted in **Supabase**, and fronted by a streaming
**Next.js** chat UI.

**Live demo:** https://fitnessbuddy-chris.vercel.app · **API:** https://fitnessbuddy-chris.fly.dev

> Built during the AI Engineer Residency from the XBuddy template
> ([TryMOSS/xbuddy-template](https://github.com/TryMOSS/xbuddy-template)), following the
> architecture of the FounderBuddy reference agent.

---

## What it does

FitnessBuddy walks the user through five sections, one at a time, without drifting off-topic or
skipping steps:

| # | Section | What it collects |
|---|---------|------------------|
| 1 | **Goals** | Primary goal (muscle, fat loss, fitness, event), rough timeline, motivation |
| 2 | **Profile** | Age, height/weight, injuries or limitations, training background |
| 3 | **Schedule** | Days per week, session length, gym vs. home, available equipment |
| 4 | **Preferences** | Training styles liked/disliked, preferred intensity |
| 5 | **Nutrition** | Diet pattern, restrictions, appetite for a calorie deficit |

When all five are covered, it synthesizes a structured plan (weekly split, exercise tables,
progression, nutrition targets, tips) that **streams into a dedicated plan card** in the chat.
The user can then **edit the plan in place** and save it back to the database.

---

## Architecture

```
                  ┌──────────────────────────── Next.js (Vercel) ────────────────────────────┐
                  │  ChatArea · ProgressSidebar · plan card (react-markdown + GFM) · editor  │
                  │  /api/chat (SSE proxy) · /api/plan (load/save plan) · /api/sections      │
                  └───────────────────────────────┬──────────────────────────────────────────┘
                                                  │ HTTPS + Server-Sent Events
                  ┌───────────────────────────────▼──────────────── FastAPI (Fly.io) ─────────┐
                  │  /fitness_buddy/stream · /invoke · /history · /business_plan             │
                  │                                                                          │
                  │   START → initialize → router → generate_reply → generate_decision       │
                  │                          ↑                              ↓                │
                  │                          └──────── memory_updater ──────┘                │
                  │                                         ↓                                │
                  │                                  implementation → END                    │
                  │                                                                          │
                  │  LangGraph checkpointer (SQLite) — conversation state per thread_id      │
                  └───────────────┬───────────────────────────────────────┬─────────────────┘
                                  │                                       │
                    Supabase (PostgreSQL)                        LangSmith
                    section_states · business_plans             traces + evals
```

### The graph, node by node

| Node | Kind | Responsibility |
|------|------|----------------|
| `initialize` | code | Cold start (new user: all sections `pending`) vs. warm start (state restored by the checkpointer). |
| `router` | code | Enforces the current `router_directive` (`stay` / `next` / `modify:<section>`) and loads the section's context packet (shared rules + section prompt). |
| `generate_reply` | LLM (Sonnet) | The user-facing, token-streamed reply. Builds its input so it never ends on an assistant message, which makes the `memory_updater → router` loop safe. |
| `generate_decision` | LLM (Haiku, structured output) | The machine-facing decision: directive, satisfaction, save flag, plus a short `reasoning` field. Temperature 0 — it's a classifier. Only re-decides on fresh user input, so one turn can't cascade through every section. |
| `memory_updater` | code + LLM | Summarizes the section into `section_states`, advances status, persists to Supabase, and sets `should_generate_final_output` when all five sections are done. |
| `implementation` | LLM (Sonnet) | Synthesizes the final plan from the five section summaries and streams it to the client as `final_plan_chunk` events, then a terminal `final_plan` event; persists to `business_plans`. |

### Key design decisions

- **Reply and decision are separate nodes.** One talks to the human (streamed prose); the other
  talks to the machine (validated structured output). Mixing them makes both worse.
- **Navigation is judged by the LLM, enforced by code.** The decision model reads intent in any
  phrasing; the router deterministically applies it. No keyword lists.
- **The plan streams.** Generation takes ~60–80 s. Streaming chunks (plus SSE heartbeats) keep the
  connection alive; if Vercel's function cap cuts the stream, the client polls the saved plan from
  `business_plans` so the card always ends complete.
- **Internal LLM calls never leak into the chat.** Summaries and decisions are tagged
  `skip_stream`, which the `/stream` endpoint filters out.
- **Thread identity comes from one place.** The SSE `metadata` event is the single source of truth
  for `thread_id`, so every turn resumes the same checkpoint.

---

## Project structure

```
fitness_buddy/
├── src/
│   ├── agents/
│   │   ├── agents.py                  # Agent registry (key: "fitness_buddy")
│   │   └── fitness_buddy/             # The agent
│   │       ├── agent.py               # Compiled graph instance
│   │       ├── enums.py               # SectionID, SectionStatus, RouterDirective
│   │       ├── models.py              # FitnessBuddyState, FitnessBuddyData, decision/output models
│   │       ├── prompts.py             # Section registry + navigation helpers
│   │       ├── tools.py               # get_context tool
│   │       ├── graph/
│   │       │   ├── builder.py         # StateGraph wiring (incl. memory_updater → router loop)
│   │       │   └── routes.py          # Conditional edges
│   │       ├── nodes/                 # initialize, router, generate_reply, generate_decision,
│   │       │                          # memory_updater, implementation
│   │       └── sections/
│   │           ├── base_prompt.py     # Shared rules for every section
│   │           └── section_1..5/      # Goals, Profile, Schedule, Preferences, Nutrition
│   ├── service/                       # FastAPI app: /stream, /invoke, /history, /business_plan
│   ├── core/                          # Settings + model factory
│   ├── integrations/supabase/         # Supabase client (section_states, business_plans)
│   ├── memory/                        # Checkpointer setup (SQLite / Postgres)
│   ├── schema/                        # API request/response models
│   └── run_service.py                 # Entrypoint
├── frontend/                          # Next.js 15 + React 19 + TypeScript
│   └── src/
│       ├── app/                       # page.tsx, api/{chat,plan,sections,agents}, section editor
│       ├── components/                # ChatArea, ProgressSidebar, SectionDisplayPanel, editors
│       └── utils/                     # Conversation storage
├── evals/                             # LangSmith eval: memory capture across turns
├── supabase/migrations/               # Database schema
├── tests/                             # pytest suite
├── docs/                              # LangGraph cheatsheet, LangSmith setup, reference notes
├── Dockerfile · fly.toml              # Backend deploy (Fly.io)
└── vercel.json                        # Frontend deploy (Vercel)
```

---

## Tech stack

**Agent:** LangGraph, LangChain, Anthropic Claude (Sonnet 4.6 for replies and the plan, Haiku 4.5
for decisions and summaries), Pydantic · **Backend:** FastAPI, SSE, uv · **Data:** Supabase
(PostgreSQL), LangGraph SQLite checkpointer · **Frontend:** Next.js 15, React 19, TypeScript,
react-markdown + remark-gfm · **Ops:** Docker, Fly.io, Vercel, LangSmith (tracing + evals)

---

## Run locally

**Backend**
```bash
cp .env.example .env          # add ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LANGCHAIN_API_KEY
uv sync
uv run python src/run_service.py        # http://localhost:8080
```

**Frontend**
```bash
cd frontend
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:8080 + Supabase anon key
npm install
npm run dev                   # http://localhost:3000
```

**Evals**
```bash
uv run python evals/memory_capture_eval.py
```

---

## Deploy

- **Backend:** `fly deploy` (app `fitnessbuddy-chris`). Secrets via `fly secrets set ...`.
- **Frontend:** push to GitHub → Vercel builds automatically. Set `NEXT_PUBLIC_API_URL` and the
  Supabase public keys in the Vercel project.

## Roadmap

- **RAG grounding (in progress):** a curated fitness/nutrition knowledge base, embedded into
  `pgvector` inside Supabase and exposed to the agent as a retrieval tool, with a retrieval-quality
  eval.
