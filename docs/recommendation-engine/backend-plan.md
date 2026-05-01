# Recommendation Engine — Backend Plan

## Context

The PDF blueprint identifies the **Recommendation Engine** (NJIT Team A, "AI Microservices Breakdown") as one of ChefASAP's core personalization features. Customers should see:

1. **"Recommended chefs for you"** — personalized ranking from their history
2. **"Chefs similar to the one you booked"** — item-item similarity
3. **"Popular menus in your area"** — geo-based popularity

The blueprint specifies **Collaborative Filtering** + **Embedding models** as the technology. Today the platform has a request-driven XGBoost ranker (`backend/ml/matching_scorer.py`) but **no proactive recommendation surface**. This doc covers the backend service. Frontend integration is in the sibling `frontend-plan.md`.

The repo already has substantial ML infrastructure to reuse — materialized views (`mv_smart_matching_features`, `mv_chef_inference_features`, `mv_customer_preference_profile`), a dataset query (`RECOMMENDATION_DATASET_QUERY` in `backend/ml/feature_queries.py`) with weighted interaction scores (bookings×5 + favorites×3 + ratings×1 + views×0.5), and tracking tables for views/favorites/ratings. We build on this rather than replace it.

## 1. Goal

Build a `recommendation_bp` Flask blueprint backed by a hybrid CF + content embedding model. The service must:

- Use **Truncated SVD** matrix factorization on the weighted interaction matrix to produce **customer and chef embeddings**.
- Combine collaborative chef embeddings with **content-based chef vectors** (cuisines, pricing tier, region, rating) for the "similar chefs" use case so it works for chefs with sparse booking data.
- **Cold-start fallback**: delegate to existing `rank_chefs()` for customers with no history, using `mv_customer_preference_profile` to fill request params.
- **Cache** precomputed top-50 recs per active customer in `recommendation_cache`, refreshed nightly.
- **Log** every served recommendation to `recommendation_logs` so click-through becomes future training data — closing the "more bookings → more data → better models" loop the blueprint highlights.

## 2. Provider & tech

- **Provider:** none (in-house, no external API).
- **Algorithms:** `sklearn.decomposition.TruncatedSVD` (k=32 latent factors), `sklearn.metrics.pairwise.cosine_similarity` (already shipped — `scikit-learn>=1.2.0` in requirements).
- **Add to `backend/requirements.txt`:** `scipy>=1.10.0` (only new dep; needed for `csr_matrix`).
- **Artifact pattern:** joblib + `.npy` files in `backend/ml/models/` — matches existing `matching_model.joblib`.

## 3. Files to create

| Path | Purpose |
|---|---|
| `backend/ml/recommendation_engine.py` | Loads embeddings + ID maps, exposes `recommend_for_customer()` and `similar_chefs()` for inference |
| `backend/ml/train_recommendation_model.py` | Pulls interactions, fits SVD, builds chef content matrix, persists artifacts |
| `backend/ml/refresh_recommendation_cache.py` | Iterates active customers, upserts top-50 recs into `recommendation_cache` |
| `backend/ml/models/chef_embeddings.npy` | (artifact) chef × 32 SVD matrix |
| `backend/ml/models/customer_embeddings.npy` | (artifact) customer × 32 SVD matrix |
| `backend/ml/models/recommendation_id_maps.joblib` | (artifact) chef_id↔row, customer_id↔row, chef content matrix, cuisine vocab |
| `backend/services/recommendation_service.py` | Orchestrator: cache lookup → live compute → hydrate chef cards → log |
| `backend/blueprints/recommendation_bp.py` | Flask routes, JWT auth, request validation |
| `backend/database/migrations/add_recommendations.sql` | New tables: `recommendation_cache`, `recommendation_logs` |
| `backend/tests/test_recommendation_service.py` | Unit tests with seeded fixture data |
| `backend/smoke_test_recommendations.py` | Manual end-to-end smoke test |

Patterns to follow:
- Blueprint: `backend/blueprints/menu_event_planner_bp.py` (`@token_required`, JSON validation helpers).
- Service: `backend/services/menu_planner_service.py` (function-based, `get_db_connection()` / `finally: conn.close()`).
- ML inference: `backend/ml/matching_scorer.py` (lazy-loaded module-level model, fallback when artifact missing).
- ML training: `backend/ml/training_matching_model.py` (CLI-runnable `python -m backend.ml.train_recommendation_model`).

## 4. Algorithm

### 4.1 Customer & chef embeddings (collaborative)

Pull interactions via the existing `RECOMMENDATION_DATASET_QUERY` (`backend/ml/feature_queries.py`). Each row is `(customer_id, chef_id, score)` where score is the weighted blend of bookings/favorites/ratings/views.

```
M = csr_matrix((scores, (customer_rows, chef_rows)),
               shape=(n_customers, n_chefs))

svd = TruncatedSVD(n_components=32, random_state=42)
customer_embeddings = svd.fit_transform(M)        # (n_customers, 32)
chef_embeddings     = svd.components_.T            # (n_chefs, 32)
```

L2-normalize both so dot product == cosine similarity.

### 4.2 Chef content vectors (for similarity & cold start)

Built in parallel with the SVD step:

- **Cuisine one-hot** from `chef_cuisines` joined to `cuisine_types` — fixed vocabulary computed at training time.
- **Normalized rating** (`avg_rating / 5.0`) from `mv_chef_inference_features`.
- **Normalized price tier** (`base_rate_per_person / max_rate`) from `chef_pricing`.
- **Region one-hot** by zip prefix (first 3 digits) from `chef_addresses`.

Stack into a single `(n_chefs, d_content)` matrix, L2-normalize.

### 4.3 Inference (`backend/ml/recommendation_engine.py`)

Module-level lazy-load (`_load_artifacts()` mirrors `_load_model()` in `matching_scorer.py`):

```python
def recommend_for_customer(customer_id, limit=10, exclude_chef_ids=None):
    idx = customer_id_map.get(customer_id)
    if idx is None:
        return None  # caller handles cold start
    scores = chef_embeddings @ customer_embeddings[idx]
    if exclude_chef_ids:
        scores[exclude_rows] = -np.inf
    top = np.argpartition(-scores, limit)[:limit]
    return [{"chef_id": chef_ids[i], "score": float(scores[i]),
             "reason_code": "cf"} for i in top[np.argsort(-scores[top])]]

def similar_chefs(chef_id, limit=10):
    idx = chef_id_map[chef_id]
    cf_sim      = chef_embeddings @ chef_embeddings[idx]
    content_sim = chef_content    @ chef_content[idx]
    blended = 0.5 * cf_sim + 0.5 * content_sim
    blended[idx] = -np.inf  # exclude self
    top = np.argpartition(-blended, limit)[:limit]
    return [{"chef_id": chef_ids[i], "score": float(blended[i]),
             "reason_code": "similar"} for i in top[np.argsort(-blended[top])]]
```

The 50/50 blend is the default; tune via env var `RECOMMENDATION_CF_WEIGHT` if needed.

### 4.4 Cold-start fallback

When `recommend_for_customer()` returns `None`, the service layer:

1. Queries `mv_customer_preference_profile` for the customer's preferred cuisine, max price, default location.
2. Builds a synthetic request_params dict.
3. Calls `rank_chefs(request_params)` from `backend/ml/matching_scorer.py`.
4. Tags every result with `reason_code='cold_start'`.

### 4.5 Popular menus by area

No ML — single SQL query joining `chef_menu_items × bookings × chef_addresses` filtered by haversine distance to the user's lat/lng, ordered by recent-90-day order count and rating. Reuses the haversine pattern from `backend/blueprints/search_bp.py`.

### 4.6 Caching strategy

- `recommendation_cache` stores top-50 chef IDs per customer with score + reason code.
- Service reads cache when `computed_at > NOW() - INTERVAL '24 hours'`; on miss computes live and writes back.
- `refresh_recommendation_cache.py` runs nightly (cron / GitHub Action), iterating customers with a booking or login in the last 90 days.

## 5. API endpoints

All under prefix `/api/v1/recommendations`, all `@token_required`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/for-you?limit=10` | Personalized chef recs for the authenticated customer |
| GET | `/similar-chefs/<int:chef_id>?limit=10` | Item-item similarity for a chef |
| GET | `/popular-menus?lat=<f>&lng=<f>&radius=10&limit=10` | Popular menus near a location |

Response shape (consistent across all three):

```json
{
  "use_case": "for_you",
  "recommendations": [
    {
      "chef_id": 12,
      "first_name": "Marcus",
      "last_name": "Johnson",
      "photo_url": "...",
      "cuisines": ["Caribbean", "Jamaican"],
      "avg_rating": 4.8,
      "base_rate_per_person": 45.00,
      "score": 0.87,
      "reason_code": "cf"
    }
  ]
}
```

For `popular-menus` the items have a `dish_name`, `cuisine_type`, `price` and a nested `chef` object.

Request validation: `limit ∈ [1, 50]`, `radius ∈ [1, 50]`, lat/lng are floats. Reject with 400 on invalid input — match the `backend/blueprints/menu_event_planner_bp.py` error pattern.

## 6. Database changes

```sql
CREATE TABLE IF NOT EXISTS recommendation_cache (
    id           SERIAL PRIMARY KEY,
    customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    chef_id      INTEGER NOT NULL REFERENCES chefs(id)     ON DELETE CASCADE,
    score        FLOAT   NOT NULL,
    reason_code  VARCHAR(32) NOT NULL,
    rank         INTEGER NOT NULL,
    computed_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (customer_id, chef_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_cache_customer
    ON recommendation_cache (customer_id, rank);
CREATE INDEX IF NOT EXISTS idx_rec_cache_computed
    ON recommendation_cache (computed_at);

CREATE TABLE IF NOT EXISTS recommendation_logs (
    id              SERIAL PRIMARY KEY,
    customer_id     INTEGER REFERENCES customers(id),
    use_case        VARCHAR(32) NOT NULL,
    source_chef_id  INTEGER REFERENCES chefs(id),
    served_chef_ids INTEGER[] NOT NULL,
    served_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_logs_customer_time
    ON recommendation_logs (customer_id, served_at DESC);
```

Migration script lives in `backend/database/migrations/add_recommendations.sql`.

## 7. Testing

- **Unit tests** for `recommendation_engine.py`: assert top-K ordering, exclusion of self in `similar_chefs`, exclusion of already-booked chefs in `recommend_for_customer`.
- **Service tests** in `backend/tests/test_recommendation_service.py`:
  1. Cache hit returns cached rows without calling the engine.
  2. Cache miss triggers `recommend_for_customer()` and writes back.
  3. Cold-start customer falls through to `rank_chefs()` and tags `reason_code='cold_start'`.
  4. `get_popular_menus_near()` excludes points outside radius.
- **Integration test** with `app.test_client()` and a seeded test DB: hit each endpoint, assert response schema.
- **Smoke test** `backend/smoke_test_recommendations.py`:
  1. Train model on the live DB
  2. Call `recommend_for_customer(customer_id=<known_id>)` and print top 10
  3. Call `similar_chefs(chef_id=<known_id>)` and print top 10
  4. Inserts test rows into `recommendation_logs`

## 8. Verification

1. `pip install -r backend/requirements.txt` adds `scipy`.
2. Run `backend/database/migrations/add_recommendations.sql` against the Render Postgres instance.
3. `python -m backend.ml.train_recommendation_model` — produces `chef_embeddings.npy`, `customer_embeddings.npy`, `recommendation_id_maps.joblib` in `backend/ml/models/`.
4. `pytest backend/tests/test_recommendation_service.py` passes.
5. Start the backend, get a customer JWT, hit each endpoint:
   ```
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/v1/recommendations/for-you?limit=5"
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/v1/recommendations/similar-chefs/1?limit=5"
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:3000/api/v1/recommendations/popular-menus?lat=40.74&lng=-74.18&radius=15&limit=5"
   ```
   Each returns the §5 JSON.
6. Cold-start check: create a fresh customer with zero bookings → `for-you` still returns 10 chefs, all with `reason_code: "cold_start"`.
7. Cache check: after first call, `SELECT COUNT(*) FROM recommendation_cache WHERE customer_id = ?` returns 50; `SELECT * FROM recommendation_logs ORDER BY served_at DESC LIMIT 1` shows the just-served IDs.
8. Run `python -m backend.ml.refresh_recommendation_cache` end-to-end — confirm rows updated for active customers.

## Critical files referenced

- `backend/app.py` — register `recommendation_bp` next to other `/api/v1/*` blueprints
- `backend/blueprints/menu_event_planner_bp.py` — blueprint pattern, `@token_required` JWT
- `backend/services/menu_planner_service.py` — service pattern (function-based, DB connection lifecycle)
- `backend/ml/matching_scorer.py` — `rank_chefs()` for cold-start fallback; `_load_model()` lazy-load pattern
- `backend/ml/feature_queries.py` — `RECOMMENDATION_DATASET_QUERY` is the training data source
- `backend/ml/feature_engineering.py` — `build_inference_features()` for cold-start request params
- `backend/ml/training_matching_model.py` — training script CLI conventions
- `backend/database/db_helper.py` — `get_db_connection()`, `get_cursor()`
- `backend/blueprints/search_bp.py` — chef-card SELECT shape and haversine pattern
- Materialized views `mv_customer_preference_profile`, `mv_chef_inference_features`, `mv_chef_performance` — already populated
- `backend/requirements.txt` — add `scipy>=1.10.0`
