# FounderBuddy Reference

Your FitnessBuddy agent replicates the architecture of **FounderBuddy** — a production agent that helps entrepreneurs build business frameworks through structured dialogue.

**Repo:** https://github.com/Victoria824/FounderBuddy

## Architecture

```
START → initialize → router → generate_reply → generate_decision → memory_updater → router (loop)
                                                                                        ↓
                                                                                 implementation → END
```

## Node responsibilities

| Node | What it does | Key learning |
|------|-------------|--------------|
| `initialize` | Validates user_id, thread_id, sets defaults | State setup patterns |
| `router` | Reads directive, loads context for current section | Conditional routing, section navigation |
| `generate_reply` | Calls LLM with section context, streams response | Streaming, prompt construction |
| `generate_decision` | Analyzes conversation, decides stay/next/modify | Structured output from LLM |
| `memory_updater` | Saves section data, checks completion | Supabase persistence, state management |
| `implementation` | Generates final artifact from all sections | Document synthesis |

## State schema

FounderBuddy uses `FounderBuddyState(MessagesState)` with these key fields:
- `current_section` — which section is active
- `context_packet` — system prompt + rules for current section
- `section_states` — status of all sections (pending/in_progress/done)
- `router_directive` — stay / next / modify:section_id
- `short_memory` — last 10 messages per section
- `agent_output` — reply + decision data
- `finished` — all sections complete

## Section structure

Each section has:
- `SectionTemplate` with system prompt, validation rules, required fields
- Linked to next section in sequence
- Context loaded by router via `get_context` tool

## Key patterns to replicate

1. **One question at a time** — never dump all questions
2. **No placeholders** — if you don't have data, ask for it
3. **Satisfaction check** — present summary, ask if user is happy
4. **Short memory** — keep last 10 messages per section to manage context
5. **Separation of concerns** — reply and decision are separate nodes
