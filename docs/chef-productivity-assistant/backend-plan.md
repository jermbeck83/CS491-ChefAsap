# Chef Productivity Assistant LLM — Backend Plan

## Context

The PDF AI Optimization Blueprint identifies the **Chef Productivity Assistant** (Section 4 / Team C #2) as a chef-facing LLM tool. Where the Menu & Event Planner helps customers plan, this assistant helps the chef **execute** a booking they already have. For any booking on a chef's calendar it produces:

1. **Prep lists** — ingredient and station prep itemized per dish, anchored to "T-24h / T-2h / T-30m" windows
2. **Cooking timelines** — back-timed schedule from the service hour
3. **Ingredient substitutions** — ranked swaps for allergies, missing items, or dietary restrictions
4. **Plating suggestions** — presentation guidance per dish

This document covers the backend prompt-engineering work, the supporting LLM service / API endpoints / database changes. The frontend integration is in the sibling [frontend-plan.md](frontend-plan.md).

The codebase already has a precedent for AI-flavored services ([backend/services/fraud_service.py](../../backend/services/fraud_service.py), [backend/services/pricing_engine.py](../../backend/services/pricing_engine.py)). The Anthropic SDK, prompt caching, and the `ANTHROPIC_API_KEY` env var are introduced by the Menu & Event Planner work in [docs/menu-event-planner/backend-plan.md](../menu-event-planner/backend-plan.md) — **this plan depends on that work landing first** so `backend/services/llm_service.py` exists to reuse.

The chef catalog tables (`chefs`, `chef_cuisines`, `chef_menu_items`, `chef_pricing`) and the `bookings` table already exist and are reused as **retrieval context** for the LLM, never rebuilt.

## 1. Goal

Build a `chef_productivity_bp` Flask blueprint that wraps Anthropic Claude with carefully engineered prompts for the four capabilities. The blueprint must:

- Use **prompt caching** to cut cost — system prompt and chef menu catalog change rarely; reuse cache across capabilities and across reruns within a session.
- **Retrieve real chef data** (booking row + chef's actual `chef_menu_items`) before calling the LLM so output is grounded in what the chef actually cooks, not hallucinated.
- Return **structured JSON** per capability that the frontend can render directly into cards.
- Enforce strict ownership: a chef can only request output for their own bookings.

## 2. Provider & model

- **Provider:** Anthropic Claude (reuse the client wired up by Menu & Event Planner).
- **Default model:** `claude-sonnet-4-6` for quality on culinary reasoning.
- **Fast path model:** `claude-haiku-4-5-20251001` for substitution lookups (single-item, cost-sensitive).
- **Env var:** `ANTHROPIC_API_KEY` — already added to `backend/.env.example` by the Menu & Event Planner work.
- **Dependency:** `anthropic>=0.40.0` — already in `backend/requirements.txt` after that feature lands.

## 3. Files to create

| Path | Purpose |
|---|---|
| `backend/services/chef_productivity_service.py` | Orchestrator: load booking + chef menu → call LLM per capability → persist session |
| `backend/services/prompts/chef_productivity_system.py` | The single cached system prompt (chef-facing tone, output contract) |
| `backend/services/prompts/prep_list.py` | Capability 1 prompt builder + 1 few-shot |
| `backend/services/prompts/cooking_timeline.py` | Capability 2 prompt builder (back-timed schedule) |
| `backend/services/prompts/substitutions.py` | Capability 3 prompt builder (single-item swap lookups) |
| `backend/services/prompts/plating.py` | Capability 4 prompt builder |
| `backend/blueprints/chef_productivity_bp.py` | Flask routes, JWT auth, ownership checks, request validation |
| `backend/database/migrations/add_chef_productivity_sessions.sql` | New table (see §6) |
| `backend/tests/test_chef_productivity_prompts.py` | Golden-output tests, one per capability |

Patterns to follow:
- Service: [backend/services/fraud_service.py](../../backend/services/fraud_service.py) (DB-helper usage, fail-open exception handling).
- Blueprint: [backend/blueprints/pricing_bp.py](../../backend/blueprints/pricing_bp.py) (clean service-call wrapper).
- JWT auth: `@token_required` from [backend/blueprints/stripe_payment_bp.py](../../backend/blueprints/stripe_payment_bp.py).
- LLM client + prompt caching: `backend/services/llm_service.py` (delivered by Menu & Event Planner; reused as-is here).

## 4. Prompt engineering

### 4.1 System prompt (cached)

Single source of truth for the assistant's identity, tone, and output contract. Stored in `chef_productivity_system.py` and sent with `cache_control: {"type": "ephemeral"}` so the 5-min cache absorbs it across all capability calls.

Key sections:
1. **Role** — "You are ChefASAP's kitchen-side assistant for working chefs. You produce concise, action-ready prep lists, timelines, substitutions, and plating notes for a specific upcoming booking."
2. **Hard rules** —
   - Ground every dish in the chef's actual menu items provided in `<chef_menu>`. Never invent dishes the chef doesn't cook.
   - Always respect the booking's `dietary_restrictions`; flag conflicts explicitly.
   - For substitutions, never recommend ingredients that violate the stated dietary restrictions.
   - Output is always JSON matching the schema in §4.2 — no prose before/after.
3. **Style** — terse, professional, kitchen-shorthand acceptable (e.g., "mise: dice 1lb shallots").
4. **Refusals** — politely decline non-culinary tasks.

### 4.2 Output schemas (one per capability, each independently rendered)

```json
// prep_list
{
  "booking_id": 42,
  "items": [
    { "dish": "Jerk Chicken", "task": "Marinate chicken thighs", "duration_min": 15, "do_at": "T-24h" },
    { "dish": "Rice & Peas", "task": "Soak rice",               "duration_min": 5,  "do_at": "T-12h" }
  ]
}
```

```json
// cooking_timeline
{
  "booking_id": 42,
  "service_at": "2026-05-15T19:00:00",
  "steps": [
    { "time": "T-90m", "action": "Rice on", "dish": "Rice & Peas" },
    { "time": "T-30m", "action": "Sear chicken", "dish": "Jerk Chicken" }
  ]
}
```

```json
// substitutions
{
  "original": "Scotch bonnet pepper",
  "reason": "out of stock",
  "options": [
    { "swap": "Habanero",       "ratio": "1:1",   "notes": "Slightly less fruity" },
    { "swap": "Serrano + dash hot sauce", "ratio": "2:1", "notes": "Milder; build heat" }
  ]
}
```

```json
// plating
{
  "dish": "Jerk Chicken",
  "style": "Caribbean rustic",
  "steps": ["Mound rice off-center", "Lean two thigh pieces against rice"],
  "garnish": ["Lime wedge", "Scallion ribbon"]
}
```

### 4.3 Per-capability prompt templates

Each prompt file exports `build_messages(context: dict) -> list[dict]` that produces the Claude `messages` array. Common pattern:

```
[system: cached system prompt]
[user: <booking_details>...JSON: date, guest_count, dietary_restrictions, cuisine...</booking_details>
       <chef_menu>...JSON of chef_menu_items rows for this chef, cached per chef_id...</chef_menu>
       <event_context>...service hour, location notes if any...</event_context>
       Task: <capability-specific instruction + output schema reminder>]
```

**Capability 1 — Prep list.** Few-shot with one hand-crafted example (multi-course dinner). Stress duration-min realism and ahead-of-time staging buckets (`T-24h`, `T-12h`, `T-2h`, `T-30m`).

**Capability 2 — Cooking timeline.** Must back-time from `service_at`, never overlap two heat-intensive steps on the same burner. Output is a dense `T-XXm` schedule.

**Capability 3 — Substitutions.** Single-turn, cheapest call. Body is `{original, reason, dietary_restrictions[]}`. LLM returns 2–3 ranked options with ratio + notes. No booking required (general-purpose lookup the chef can use anytime).

**Capability 4 — Plating.** Prompt includes the dish name + cuisine. Output is one short style descriptor + bullet steps + 1–3 garnish suggestions. If `dish_id` is not provided, generates plating notes for every menu item on that booking.

### 4.4 Prompt caching strategy

- System prompt → `cache_control: ephemeral` (5-min TTL, hits common across all chefs).
- `<chef_menu>` block → cache per `chef_id`; reused across all four capabilities for the same booking and across multiple bookings for the same chef within 5 min.
- Per-booking `<booking_details>` and `<event_context>` → not cached (varies per call).
- Don't cache substitution requests (one-off and small).

Target: 60%+ cache-read tokens after the first call in a chef's session. Track in `app_events_log` (existing analytics table).

## 5. API endpoints

All under prefix `/api/v1/chef-productivity`, all `@token_required`. Booking-scoped routes assert `user_type == 'chef'` AND `current_user_id == bookings.chef_id` to prevent cross-chef access.

| Method | Path | Purpose |
|---|---|---|
| POST | `/booking/<booking_id>/prep-list`  | Capability 1 — generate prep list for the booking |
| POST | `/booking/<booking_id>/timeline`   | Capability 2 — generate cooking timeline |
| POST | `/substitutions`                   | Capability 3 — body `{original, reason, dietary_restrictions[]}` |
| POST | `/booking/<booking_id>/plating`    | Capability 4 — body optional `{dish_id}` to scope to one dish |
| GET  | `/booking/<booking_id>/sessions`   | List prior sessions for that booking (allows frontend to hydrate without recompute) |

Request validation: `booking_id` exists and belongs to current chef; reject 403 otherwise. Capability 3 has no booking_id and is general-purpose. Reject with 400 on missing fields, matching the [backend/blueprints/search_bp.py](../../backend/blueprints/search_bp.py) error pattern.

## 6. Database changes

```sql
CREATE TABLE chef_productivity_sessions (
  id SERIAL PRIMARY KEY,
  chef_id INT REFERENCES chefs(id),
  booking_id INT REFERENCES bookings(id) NULL,  -- NULL for ad-hoc substitution lookups
  capability VARCHAR(32) NOT NULL,              -- 'prep_list' | 'timeline' | 'substitutions' | 'plating'
  request_json JSONB NOT NULL,
  response_json JSONB NOT NULL,
  llm_model VARCHAR(64),
  input_tokens INT,
  output_tokens INT,
  cache_read_tokens INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON chef_productivity_sessions (chef_id, booking_id, capability, created_at DESC);
```

Migration script lives in `backend/database/migrations/add_chef_productivity_sessions.sql` (follows the existing pattern in `backend/update_fraud_db.py`).

## 7. Testing

- **Unit tests** for each prompt builder: assert system prompt comes first, `cache_control` is set on system + `<chef_menu>` blocks, message order is deterministic.
- **Golden-output tests** in `backend/tests/test_chef_productivity_prompts.py`: one fixture booking per capability, snapshot the JSON, fail on schema drift.
- **Integration test** with a mocked Anthropic client: assert each route returns the expected schema and persists a row to `chef_productivity_sessions`.
- **Authorization test**: a chef calling another chef's `booking_id` gets 403.

## 8. Verification

1. `pip install -r backend/requirements.txt` (no new dep beyond what Menu & Event Planner adds).
2. Run `backend/database/migrations/add_chef_productivity_sessions.sql` against Render Postgres; confirm table + index exist.
3. `pytest backend/tests/test_chef_productivity_prompts.py` passes.
4. `curl -X POST http://localhost:3000/api/v1/chef-productivity/booking/<id>/prep-list -H "Authorization: Bearer $CHEF_TOKEN"` returns the §4.2 `prep_list` JSON.
5. Repeat the same call within 5 min; confirm `cache_read_tokens > 0` in the persisted session row (cache hit).
6. Cross-chef test: log in as a different chef, call the same booking endpoint, confirm 403.

## Critical files referenced

- `backend/app.py` — register `chef_productivity_bp` here
- `backend/blueprints/pricing_bp.py` — blueprint pattern to copy
- `backend/blueprints/stripe_payment_bp.py` — `@token_required` JWT pattern
- `backend/services/fraud_service.py` — service-class pattern (DB helpers, exception handling)
- `backend/services/llm_service.py` — created by Menu & Event Planner; reused as-is
- `backend/database/db_helper.py` — `get_db_connection`, `get_cursor`
- `backend/database/setup_postgres.py` — `chef_menu_items`, `bookings` schemas referenced for prompt context
- `backend/.env.example` — `ANTHROPIC_API_KEY` (added by Menu & Event Planner work)
- `docs/menu-event-planner/backend-plan.md` — sibling pattern this doc mirrors
