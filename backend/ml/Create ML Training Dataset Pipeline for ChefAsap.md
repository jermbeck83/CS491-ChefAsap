# Plan: Create ML Training Dataset Pipeline for ChefAsap

## Context

The ChefAsap platform has a rich PostgreSQL database (46 tables) collecting data on bookings, searches, ratings, chef profiles, and customer behavior — but no ML infrastructure exists yet. The AI Optimization Blueprint outlines 10 planned AI features (matching engine, dynamic pricing, recommendations, etc.). The current branch (`create_training_dataset`) is dedicated to building the data preparation layer that transforms raw relational data into ML-ready datasets.

The `app_events_log` table and `/api/v1/analytics/log_event` endpoint exist but are **unused by the frontend**. The richest data currently lives in `bookings`, `customer_recent_searches`, `customer_viewed_chefs`, `chef_ratings`, and `chef_pricing` tables.

**Goal:** Build a backend pipeline that creates materialized views for feature engineering, exports training datasets as CSV/JSON, and provides API endpoints for on-demand dataset generation — targeting the three highest-priority AI models: Smart Matching, Personalized Recommendations, and Demand Forecasting.

---

## Step 1: Add Migration Functions to `backend/database/migrations.py`

Add 4 new migration functions following the existing `preserve_bookings_chats()` pattern (guard with `has_migration_run()`, execute DDL, call `record_migration()`).

### 1a. `create_mv_smart_matching_features`
Materialized view joining `bookings`, `chef_ratings`, `chef_rating_summary`, `customer_viewed_chefs`, `customer_favorite_chefs`, `customer_addresses`, `chef_addresses`, `chef_pricing`, and `chef_cuisines`. Produces one row per (customer_id, chef_id) pair with features: booking counts by status, avg cost, avg party size, rating sub-scores, view count, is_favorited, Haversine distance, cuisine_match, pricing info.

### 1b. `create_mv_customer_preference_profile`
Materialized view aggregating per-customer behavioral profile from `bookings`, `customer_recent_searches`, `customer_viewed_chefs`, `customer_favorite_chefs`, `chef_ratings`. Features: preferred cuisine (MODE), preferred meal/event type, avg spend, search behavior, engagement counts, recency timestamps.

### 1c. `create_mv_demand_forecast_features`
Materialized view aggregating bookings by (day, day_of_week, month, cuisine_type, meal_type, city, state). Features: booking counts by status, total guests, avg cost, unique customers/chefs.

### 1d. `create_ml_dataset_export_log`
Tracking table: `ml_dataset_export_log` with columns for dataset_name, export_format, row_count, file_path, query_params (JSONB), status, timestamps, error_message. Supports ML reproducibility.

Register all 4 in the `updates` list in `run_db_updates()`.

---

## Step 2: Update `backend/database/refresh_views.py`

Add the 3 new materialized views to `refresh_analytics_views()` alongside the existing `mv_chef_performance` and `mv_geographic_demand` refreshes:
- `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_smart_matching_features`
- `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_preference_profile`
- `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demand_forecast_features`

---

## Step 3: Create `backend/ml/` Module

### 3a. `backend/ml/__init__.py`
Empty init with docstring.

### 3b. `backend/ml/feature_queries.py`
SQL query constants that read from the materialized views and apply final transformations:
- **SMART_MATCHING_DATASET_QUERY** — Selects from `mv_smart_matching_features`, COALESCEs NULLs, derives binary `match_label` (1 = completed + rated >= 3.5, 0 = only declined/cancelled)
- **RECOMMENDATION_DATASET_QUERY** — Joins `mv_customer_preference_profile` with `mv_smart_matching_features` to produce (customer, chef, interaction_score) triples for collaborative filtering
- **DEMAND_FORECAST_DATASET_QUERY** — Selects from `mv_demand_forecast_features` with optional date range params, overlays search demand from `mv_geographic_demand`

### 3c. `backend/ml/exporters.py`
Utility functions:
- `export_to_csv(rows, columns, filepath)` — Write list-of-dicts to CSV
- `export_to_json(rows, filepath)` — Write list-of-dicts to JSON-lines
- `json_serializer(obj)` — Handle Decimal, datetime, date serialization
- `ensure_export_dir(base_dir)` — Create timestamped export subdirectory

### 3d. `backend/ml/create_training_dataset.py`
Main CLI orchestrator, runnable as `python -m ml.create_training_dataset`:
- `--dataset {smart_matching, recommendations, demand_forecast, all}`
- `--format {csv, json}` (default: csv)
- `--from-date` / `--to-date` for date filtering
- `--refresh-views` flag to refresh materialized views before export
- `--output-dir` for custom output path

Each `generate_*` function: opens connection via `db_helper.get_db_connection()`, gets cursor via `get_cursor(conn, dictionary=True)`, executes query, exports, logs to `ml_dataset_export_log`, returns metadata.

---

## Step 4: Add API Endpoints to `backend/blueprints/analytics_bp.py`

Two new endpoints on the existing `analytics_bp` blueprint (already registered at `/api/v1/analytics`):

### 4a. `POST /api/v1/analytics/export_dataset`
Request: `{dataset, format, from_date, to_date, refresh_views}`
Response: `{status, dataset, row_count, file_path, columns}`

### 4b. `GET /api/v1/analytics/dataset_stats`
Returns summary stats for each dataset: row count from each materialized view, last export timestamp from `ml_dataset_export_log`, available columns.

---

## Files to Modify
- [migrations.py](backend/database/migrations.py) — Add 4 migration functions + register in `updates` list
- [refresh_views.py](backend/database/refresh_views.py) — Add 3 new view refreshes

## Files to Create
- [backend/ml/__init__.py](backend/ml/__init__.py)
- [backend/ml/feature_queries.py](backend/ml/feature_queries.py)
- [backend/ml/exporters.py](backend/ml/exporters.py)
- [backend/ml/create_training_dataset.py](backend/ml/create_training_dataset.py)

## Files to Modify (endpoints)
- [analytics_bp.py](backend/blueprints/analytics_bp.py) — Add `export_dataset` and `dataset_stats` endpoints

---

## Verification

1. Run `cd backend/database && python migrations.py` — confirm all 4 migrations succeed
2. Run `cd backend && python -m ml.create_training_dataset --all --format csv` — confirm 3 CSV files are created in `backend/ml/exports/`
3. Start Flask app, hit `GET /api/v1/analytics/dataset_stats` — confirm view row counts
4. Hit `POST /api/v1/analytics/export_dataset` with `{"dataset": "smart_matching", "format": "csv"}` — confirm export succeeds and returns metadata
5. Verify `ml_dataset_export_log` table has entries for each export