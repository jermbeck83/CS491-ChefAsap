# Menu & Event Planner LLM — Backend Plan

## Context

The PDF blueprint identifies the **Menu & Event Planner (LLM)** as one of ChefASAP's "magical" customer-facing AI features. A customer should be able to say *"I'm hosting a Jamaican dinner for 12. What should I serve?"* and the assistant produces:

1. **Menu suggestions** — courses tailored to cuisine, party size, dietary needs
2. **Ingredient suggestions / shopping lists**
3. **Cost estimates** — per-person and total
4. **Chef recommendations** — real ChefASAP chefs ranked for that event

This document covers the **backend prompt-engineering work** and the supporting LLM service / API endpoints / database changes. The frontend integration is in the sibling `frontend-plan.md`.

The repo is greenfield for LLMs — no `anthropic`/`openai` SDK, no prompt templates. The ML matching engine (`backend/ml/matching_scorer.py`), pricing engine (`backend/services/pricing_engine.py`), and chef catalog tables (`chefs`, `chef_cuisines`, `chef_menu_items`, `chef_pricing`, `chef_rating_summary`) already exist and will be reused as **retrieval context** for the LLM rather than rebuilt.

## 1. Goal

Build a `menu_event_planner_bp` Flask blueprint that wraps an Anthropic Claude LLM with carefully engineered prompts for the four capabilities. The blueprint must:

- Use **prompt caching** to cut cost (chef catalog and system prompt change rarely; reuse cache across calls).
- **Retrieve real chef and pricing data** before calling the LLM so suggestions are grounded in ChefASAP inventory, not hallucinated.
- Return **structured JSON** (menus, ingredients, cost, chef IDs) that the frontend can render directly.
- Reuse the existing ML matching engine to **re-rank** any chefs the LLM mentions.

## 2. Provider & model

- **Provider:** Anthropic Claude.
- **Default model:** `claude-sonnet-4-6` for quality on menu generation.
- **Fast path model:** `claude-haiku-4-5-20251001` for follow-up Q&A turns (cost-sensitive).
- **Env var:** add `ANTHROPIC_API_KEY` to `backend/.env.example` following the existing pattern used by `STRIPE_SECRET_KEY`.
- **Add to `backend/requirements.txt`:** `anthropic>=0.40.0`.

## 3. Files to create

| Path | Purpose |
|---|---|
| `backend/services/llm_service.py` | Claude client, prompt-cache config, retry/error handling |
| `backend/services/menu_planner_service.py` | Orchestrator: retrieves chef context, calls LLM, post-processes JSON, re-ranks chefs |
| `backend/services/prompts/system_prompt.py` | The single system prompt (cacheable) |
| `backend/services/prompts/menu_generation.py` | Prompt template + few-shot examples for capability 1 |
| `backend/services/prompts/ingredients.py` | Capability 2 |
| `backend/services/prompts/cost_estimation.py` | Capability 3 |
| `backend/services/prompts/chef_recommendation.py` | Capability 4 (LLM picks shortlist, ML re-ranks) |
| `backend/blueprints/menu_event_planner_bp.py` | Flask routes, JWT auth, request validation |
| `backend/database/migrations/add_event_plans.sql` | New tables |
| `backend/tests/test_menu_planner_prompts.py` | Golden-output tests |
| `backend/smoke_test_llm.py` | Manual end-to-end smoke test against the real Anthropic API |

Patterns to follow:
- Blueprint: `backend/blueprints/pricing_bp.py` (clean service-call wrapper).
- Service: `backend/services/pricing_engine.py`.
- JWT auth: `backend/blueprints/stripe_payment_bp.py` `@token_required`.

## 4. Prompt engineering

### 4.1 System prompt (cached)

Single source of truth for the assistant's identity, tone, and output contract. Stored in `system_prompt.py` and sent with `cache_control: {"type": "ephemeral"}` so the 5-min cache absorbs it across turns.

Key sections:
1. **Role** — "You are ChefASAP's culinary event-planning assistant. You help hosts plan dinners by recommending menus, ingredients, costs, and real chefs from the ChefASAP marketplace."
2. **Hard rules** —
   - Never recommend a chef that wasn't passed in the `<available_chefs>` block (no hallucinated chefs).
   - Always respect dietary restrictions; flag conflicts explicitly.
   - Cost estimates must use the prices from `<pricing_context>`; never invent prices.
   - Output is always JSON matching the schema in §4.2.
3. **Style** — warm but concise; explain *why* a dish/chef was chosen in one sentence per item.
4. **Refusals** — politely decline non-culinary tasks.

### 4.2 Output schema (one structured object, all four capabilities)

```json
{
  "event_summary": { "cuisine": "Jamaican", "guest_count": 12, "dietary_notes": [] },
  "menu": [
    { "course": "appetizer", "dish": "Jerk Chicken Wings", "rationale": "...", "serves": 12 }
  ],
  "ingredients": [
    { "item": "Scotch bonnet peppers", "quantity": "6", "unit": "peppers", "course": "..." }
  ],
  "cost_estimate": {
    "per_person_usd": 48.00,
    "total_usd": 576.00,
    "breakdown": { "ingredients": 220.00, "chef_service": 356.00 },
    "confidence": "medium"
  },
  "recommended_chefs": [
    { "chef_id": 12, "match_reason": "Specializes in Caribbean cuisine, 4.8 stars", "ml_score": 0.87 }
  ]
}
```

Frontend renders sections progressively as the JSON streams in.

### 4.3 Per-capability prompt templates

Each prompt file exports a function `build_messages(context: dict) -> list[dict]` that produces the Claude `messages` array. Common pattern:

```
[system: cached system prompt]
[user: <event_request>...</event_request>
       <available_chefs>...JSON of top 20 nearby chefs from search_bp...</available_chefs>
       <pricing_context>...base rates from chef_pricing + dynamic multiplier...</pricing_context>
       <past_bookings>...if customer has history, summary...</past_bookings>
       Task: generate the full event plan JSON.]
```

**Capability 1 — Menu generation.** Few-shot with 2 hand-crafted examples (Jamaican dinner / Italian brunch). Stress: course balance (apps/main/sides/dessert), dietary respect, chef-feasibility (match to chef menu items when possible).

**Capability 2 — Ingredient suggestions.** Run as a follow-up turn on the same conversation (cached system prompt + cached menu output) — derives shopping list from menu. Cheaper because most context is cached.

**Capability 3 — Cost estimation.** Prompt receives `<pricing_context>` populated by querying `chef_pricing.base_rate_per_person` for the candidate chefs and the live multiplier from `backend/services/pricing_engine.py`. LLM combines ingredient costs (rough USD per item using a small static price-hint table) + chef service cost. Confidence comes from data completeness.

**Capability 4 — Chef recommendation.** Two-stage:
  1. SQL retrieval: top 20 chefs filtered by `cuisine_match`, `chef_addresses` distance, `chef_rating_summary.average_rating >= 4.0` — reuse query shape from `backend/blueprints/search_bp.py` lines 54–97.
  2. LLM picks 3–5 from the 20 with rationales, returning `chef_id`s.
  3. Post-process: feed those `chef_id`s through `rank_chefs()` in `backend/ml/matching_scorer.py` to attach the trained `match_score`. The frontend sorts by `ml_score`, displays LLM `match_reason`.

This grounds chef output in reality and compounds with the existing matching investment.

### 4.4 Prompt caching strategy

- System prompt → `cache_control: ephemeral` (5-min TTL, hits common across all users).
- `<available_chefs>` block → cache per (zip, cuisine) tuple; key in Redis (per architecture doc) for 60s.
- Don't cache user-specific event requests.

Target: 70%+ cache-read tokens on a warm conversation. Track in `app_events_log` (existing analytics table).

## 5. API endpoints

All under prefix `/api/v1/menu-planner`, all `@token_required`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/plan` | One-shot: full event plan from a single user prompt + event details. Returns the §4.2 JSON. |
| POST | `/chat` | Multi-turn: pass `conversation_id` + new message; returns assistant turn (streamed if client supports it). Used by the chat UI. |
| GET  | `/plan/<plan_id>` | Fetch a saved plan. |
| POST | `/plan/<plan_id>/book` | Convert a plan into a booking using the recommended chef (links to existing booking flow). |

Request validation: lat/lon, guest_count (1–200), event_date (future), dietary_restrictions (array). Reject with 400 on missing fields, matching the `backend/blueprints/search_bp.py` error pattern.

## 6. Database changes

```sql
CREATE TABLE IF NOT EXISTS event_plans (
    id                    SERIAL PRIMARY KEY,
    customer_id           INT REFERENCES customers(id),
    conversation_id       UUID NOT NULL,
    event_date            DATE,
    cuisine_type          VARCHAR(64),
    guest_count           INT,
    plan_json             JSONB NOT NULL,
    llm_model             VARCHAR(64),
    llm_input_tokens      INT,
    llm_output_tokens     INT,
    llm_cache_read_tokens INT,
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_plan_messages (
    id              SERIAL PRIMARY KEY,
    conversation_id UUID NOT NULL,
    role            VARCHAR(16) NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_plan_messages_conv_time
    ON event_plan_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_event_plans_customer
    ON event_plans (customer_id, created_at DESC);
```

Migration script lives in `backend/database/migrations/add_event_plans.sql` 

## 7. Testing

- **Unit tests** for each prompt builder: assert deterministic message structure.
- **Golden-output tests** in `backend/tests/test_menu_planner_prompts.py`: 5 fixed event scenarios, snapshot the LLM JSON, fail on schema drift.
- **Integration test** that hits the live API with a mocked `ANTHROPIC_API_KEY` and asserts end-to-end JSON shape.
- **Smoke test** `backend/smoke_test_llm.py`: runs three calls against the real Anthropic API —
  1. Call 1 — LLM-only plan (cache write, no DB)
  2. Call 2 — repeat identical prompt (verifies `cache_read_input_tokens > 0`)
  3. Call 3 — full service path through `create_event_plan()` (writes to `event_plans` + `event_plan_messages`; requires a valid `customer_id`)
- **Manual eval rubric** (separate doc, out of scope here): 20 scenarios scored by team for relevance, dietary correctness, cost realism.

## 8. Verification

1. `pip install -r backend/requirements.txt` adds `anthropic`.
2. Run `backend/database/migrations/add_event_plans.sql` against the Render Postgres instance (e.g. via pgAdmin or `psql $DATABASE_URL -f ...`).
3. `pytest backend/tests/test_menu_planner_prompts.py` passes (mocked LLM, no API key required).
4. Set `ANTHROPIC_API_KEY` in `backend/.env`, then `cd backend && python smoke_test_llm.py`. Expected output:
   - Call 1: `cache_creation_input_tokens > 0`
   - Call 2: `cache_read_input_tokens > 0`, prints `Cache hit: YES ✓`
   - Call 3: prints `plan_id` and `conversation_id`; new rows visible in pgAdmin
5. `curl -X POST http://localhost:3000/api/v1/menu-planner/plan -H "Authorization: Bearer $TOKEN" -d '{"cuisine":"Jamaican","guest_count":12,"event_date":"2026-05-15","zip":"07102","latitude":40.7357,"longitude":-74.1724}'` returns the §4.2 JSON.
6. Confirm cache-read ratio in the response's `usage` block is at least 50% on the second call within 5 minutes.

## Critical files referenced

- `backend/app.py` — blueprint registration
- `backend/blueprints/pricing_bp.py` — blueprint pattern to copy
- `backend/blueprints/search_bp.py` — chef retrieval SQL to reuse
- `backend/blueprints/stripe_payment_bp.py` — `@token_required` JWT pattern
- `backend/services/pricing_engine.py` — service pattern; supplies live pricing multiplier
- `backend/ml/matching_scorer.py` — `rank_chefs()` to re-rank LLM chef picks
- `backend/database/db_helper.py` — DB connection helper
- `backend/.env.example` — add `ANTHROPIC_API_KEY` here
- `backend/requirements.txt` — add `anthropic>=0.40.0`
