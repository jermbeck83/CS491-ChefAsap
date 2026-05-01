"""
Unit tests for services.recommendation_service.

conftest.py adds backend/ to sys.path so imports resolve without installation.
DB and ML calls are mocked; no live DB or trained artifacts are needed.
"""

from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mock_conn():
    conn = MagicMock()
    conn.close = MagicMock()
    return conn


# ---------------------------------------------------------------------------
# get_recommendations_for_customer
# ---------------------------------------------------------------------------

class TestGetRecommendationsForCustomer:

    def test_cache_hit_skips_engine(self):
        """When the cache is warm, the CF engine must not be called."""
        cached = [
            {"chef_id": 1, "score": 0.9, "reason_code": "cf"},
            {"chef_id": 2, "score": 0.8, "reason_code": "cf"},
        ]
        conn = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._read_cache", return_value=cached), \
             patch("services.recommendation_service._cf_recommend") as mock_cf, \
             patch("services.recommendation_service._hydrate_chefs", return_value=[]), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            svc.get_recommendations_for_customer(customer_id=42)

        mock_cf.assert_not_called()

    def test_cache_miss_calls_engine_and_writes_back(self):
        """Cache miss: CF engine called and top-50 written to cache."""
        engine_recs = [
            {"chef_id": i, "score": 1.0 - i * 0.01, "reason_code": "cf"}
            for i in range(50)
        ]
        conn = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._read_cache", return_value=None), \
             patch("services.recommendation_service._cf_recommend", return_value=engine_recs), \
             patch("services.recommendation_service._write_cache") as mock_write, \
             patch("services.recommendation_service._hydrate_chefs", return_value=[]), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            svc.get_recommendations_for_customer(customer_id=42, limit=10)

        # All 50 recs must be written to cache
        mock_write.assert_called_once_with(conn, 42, engine_recs)

    def test_cache_miss_serves_only_requested_limit(self):
        """Service must slice engine results to the requested limit."""
        engine_recs = [
            {"chef_id": i, "score": 1.0 - i * 0.01, "reason_code": "cf"}
            for i in range(50)
        ]
        conn = _mock_conn()
        hydrated = [{"chef_id": i} for i in range(5)]

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._read_cache", return_value=None), \
             patch("services.recommendation_service._cf_recommend", return_value=engine_recs), \
             patch("services.recommendation_service._write_cache"), \
             patch("services.recommendation_service._hydrate_chefs", return_value=hydrated) as mock_hydrate, \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            svc.get_recommendations_for_customer(customer_id=42, limit=5)

        # _hydrate_chefs should receive only the first 5 recs
        passed_recs = mock_hydrate.call_args[0][1]
        assert len(passed_recs) == 5

    def test_cold_start_falls_through_to_rank_chefs(self):
        """CF returns None → _cold_start called, reason_code='cold_start'."""
        cold_recs = [
            {"chef_id": 99, "score": 0.3, "reason_code": "cold_start"},
        ]
        conn = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._read_cache", return_value=None), \
             patch("services.recommendation_service._cf_recommend", return_value=None), \
             patch("services.recommendation_service._cold_start", return_value=cold_recs) as mock_cold, \
             patch("services.recommendation_service._hydrate_chefs", return_value=[]), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            svc.get_recommendations_for_customer(customer_id=42, limit=10)

        mock_cold.assert_called_once_with(conn, 42, 10)

    def test_result_use_case_is_for_you(self):
        cached = [{"chef_id": 1, "score": 0.9, "reason_code": "cf"}]
        conn   = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._read_cache", return_value=cached), \
             patch("services.recommendation_service._hydrate_chefs", return_value=[{"chef_id": 1}]), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            result = svc.get_recommendations_for_customer(customer_id=42)

        assert result["use_case"] == "for_you"
        assert "recommendations" in result


# ---------------------------------------------------------------------------
# get_similar_chefs
# ---------------------------------------------------------------------------

class TestGetSimilarChefs:

    def test_excludes_self_from_results(self):
        """similar_chefs engine already excludes self; service just relays results."""
        sims = [
            {"chef_id": 2, "score": 0.95, "reason_code": "similar"},
            {"chef_id": 3, "score": 0.88, "reason_code": "similar"},
        ]
        conn = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._cf_similar", return_value=sims), \
             patch("services.recommendation_service._hydrate_chefs", return_value=sims), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            result = svc.get_similar_chefs(chef_id=1, customer_id=42)

        chef_ids = [r["chef_id"] for r in result["recommendations"]]
        assert 1 not in chef_ids

    def test_result_use_case_is_similar_chefs(self):
        conn = _mock_conn()

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service._cf_similar", return_value=[]), \
             patch("services.recommendation_service._hydrate_chefs", return_value=[]), \
             patch("services.recommendation_service._log_recommendation"):

            import services.recommendation_service as svc
            result = svc.get_similar_chefs(chef_id=1, customer_id=42)

        assert result["use_case"] == "similar_chefs"


# ---------------------------------------------------------------------------
# get_popular_menus_near
# ---------------------------------------------------------------------------

class TestGetPopularMenusNear:

    def test_radius_is_passed_to_query(self):
        """The radius value must appear in the DB query parameters."""
        conn   = _mock_conn()
        cursor = MagicMock()
        cursor.fetchall.return_value = []

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service.get_cursor", return_value=cursor):

            import services.recommendation_service as svc
            svc.get_popular_menus_near(lat=40.74, lng=-74.18, radius=5.0, limit=10)

        # Verify the cursor was called and radius 5.0 is in the params tuple
        assert cursor.execute.called
        sql_params = cursor.execute.call_args[0][1]
        assert 5.0 in sql_params

    def test_returns_empty_list_when_no_results(self):
        conn   = _mock_conn()
        cursor = MagicMock()
        cursor.fetchall.return_value = []

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service.get_cursor", return_value=cursor):

            import services.recommendation_service as svc
            result = svc.get_popular_menus_near(lat=40.74, lng=-74.18, radius=10, limit=10)

        assert result["use_case"] == "popular_menus"
        assert result["recommendations"] == []

    def test_result_shape(self):
        conn   = _mock_conn()
        cursor = MagicMock()
        cursor.fetchall.return_value = [
            {
                "menu_item_id": 7,
                "dish_name":    "Jerk Chicken",
                "cuisine_type": "Caribbean",
                "price":        25.0,
                "chef_id":      1,
                "first_name":   "Marcus",
                "last_name":    "Johnson",
                "chef_avg_rating": 4.8,
                "order_count":  42,
                "distance_miles": 3.2,
            }
        ]

        with patch("services.recommendation_service.get_db_connection", return_value=conn), \
             patch("services.recommendation_service.get_cursor", return_value=cursor):

            import services.recommendation_service as svc
            result = svc.get_popular_menus_near(lat=40.74, lng=-74.18, radius=10, limit=10)

        item = result["recommendations"][0]
        assert item["dish_name"]       == "Jerk Chicken"
        assert item["chef"]["chef_id"] == 1
        assert "price" in item
        assert "order_count" in item


# ---------------------------------------------------------------------------
# recommendation_engine (unit-level)
# ---------------------------------------------------------------------------

class TestRecommendationEngine:

    def test_recommend_returns_none_when_artifacts_missing(self):
        """Engine returns None if model files have not been trained yet."""
        import ml.recommendation_engine as eng
        import importlib

        orig = eng._artifacts
        eng._artifacts = None  # force reload check

        with patch("os.path.exists", return_value=False):
            importlib.reload(eng)
            result = eng.recommend_for_customer(customer_id=1)

        assert result is None
        # restore
        eng._artifacts = orig

    def test_similar_chefs_excludes_self(self):
        """similar_chefs must never return the queried chef in its own results."""
        import numpy as np
        import ml.recommendation_engine as eng

        n = 5
        k = 3
        chef_embeddings = np.eye(n, k, dtype=np.float32)
        chef_content    = np.eye(n, k, dtype=np.float32)
        chef_ids        = list(range(n))
        chef_id_map     = {cid: i for i, cid in enumerate(chef_ids)}

        eng._artifacts = {
            "chef_embeddings":    chef_embeddings,
            "customer_embeddings": np.zeros((1, k), dtype=np.float32),
            "chef_id_map":        chef_id_map,
            "customer_id_map":    {},
            "chef_ids":           chef_ids,
            "chef_content":       chef_content,
        }

        result = eng.similar_chefs(chef_id=0, limit=3)
        returned_ids = [r["chef_id"] for r in result]
        assert 0 not in returned_ids

        eng._artifacts = None  # reset

    def test_recommend_respects_exclude_chef_ids(self):
        """Excluded chef IDs must not appear in the output."""
        import numpy as np
        import ml.recommendation_engine as eng

        n = 5
        k = 4
        # Each chef embedding is a one-hot so cosine sim is defined
        chef_embeddings    = np.eye(n, k, dtype=np.float32)
        customer_embeddings = np.eye(1, k, dtype=np.float32)
        chef_ids           = list(range(n))
        chef_id_map        = {cid: i for i, cid in enumerate(chef_ids)}

        eng._artifacts = {
            "chef_embeddings":    chef_embeddings,
            "customer_embeddings": customer_embeddings,
            "chef_id_map":        chef_id_map,
            "customer_id_map":    {100: 0},
            "chef_ids":           chef_ids,
            "chef_content":       chef_embeddings.copy(),
        }

        result = eng.recommend_for_customer(customer_id=100, limit=3, exclude_chef_ids=[0, 1])
        returned_ids = [r["chef_id"] for r in result]
        assert 0 not in returned_ids
        assert 1 not in returned_ids

        eng._artifacts = None  # reset
