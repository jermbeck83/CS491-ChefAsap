"""
Recommendation service — orchestrates cache lookup, ML inference,
chef-card hydration, and recommendation logging.
"""

from __future__ import annotations

from database.db_helper import get_db_connection, get_cursor
from ml.recommendation_engine import (
    recommend_for_customer as _cf_recommend,
    similar_chefs as _cf_similar,
)
from ml.matching_scorer import rank_chefs

_CACHE_TTL_SQL = "INTERVAL '24 hours'"

_CHEF_CARD_SQL = """
    SELECT
        c.id                                                        AS chef_id,
        c.first_name,
        c.last_name,
        c.photo_url,
        cp.base_rate_per_person,
        COALESCE(crs.average_rating, 0)                            AS avg_rating,
        STRING_AGG(DISTINCT ct.name, ', ' ORDER BY ct.name)        AS cuisines
    FROM chefs c
    LEFT JOIN chef_pricing       cp  ON c.id = cp.chef_id
    LEFT JOIN chef_rating_summary crs ON c.id = crs.chef_id
    LEFT JOIN chef_cuisines      cc  ON c.id = cc.chef_id
    LEFT JOIN cuisine_types      ct  ON cc.cuisine_id = ct.id
    WHERE c.id = ANY(%s)
    GROUP BY c.id, c.first_name, c.last_name, c.photo_url,
             cp.base_rate_per_person, crs.average_rating
"""


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _read_cache(conn, customer_id: int, limit: int) -> list[dict] | None:
    cursor = get_cursor(conn, dictionary=True)
    cursor.execute("""
        SELECT chef_id, score, reason_code
        FROM recommendation_cache
        WHERE customer_id = %s
          AND computed_at > NOW() - INTERVAL '24 hours'
        ORDER BY rank
        LIMIT %s
    """, (customer_id, limit))
    rows = cursor.fetchall()
    cursor.close()
    return [dict(r) for r in rows] if rows else None


def _write_cache(conn, customer_id: int, recs: list[dict]) -> None:
    if not recs:
        return
    cursor = get_cursor(conn, dictionary=False)
    for rank, rec in enumerate(recs, start=1):
        cursor.execute("""
            INSERT INTO recommendation_cache
                (customer_id, chef_id, score, reason_code, rank, computed_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (customer_id, chef_id) DO UPDATE
                SET score       = EXCLUDED.score,
                    reason_code = EXCLUDED.reason_code,
                    rank        = EXCLUDED.rank,
                    computed_at = EXCLUDED.computed_at
        """, (customer_id, rec["chef_id"], rec["score"], rec["reason_code"], rank))
    conn.commit()
    cursor.close()


def _cold_start(conn, customer_id: int, limit: int) -> list[dict]:
    cursor = get_cursor(conn, dictionary=True)

    cursor.execute("""
        SELECT preferred_cuisine, preferred_meal_type, avg_spend, avg_search_radius
        FROM mv_customer_preference_profile
        WHERE customer_id = %s
        LIMIT 1
    """, (customer_id,))
    profile = cursor.fetchone() or {}

    # Pull the customer's home coordinates from customer_addresses.
    lat, lng = None, None
    try:
        cursor.execute("""
            SELECT latitude, longitude
            FROM customer_addresses
            WHERE customer_id = %s AND is_default = TRUE
            LIMIT 1
        """, (customer_id,))
        loc = cursor.fetchone()
        if loc:
            lat = float(loc["latitude"])
            lng = float(loc["longitude"])
    except Exception:
        pass  # fall through to ValueError guard below

    cursor.close()

    request_params = {
        "latitude":  lat,
        "longitude": lng,
        "cuisine":   profile.get("preferred_cuisine", ""),
        "max_price": profile.get("avg_spend"),
        "radius":    profile.get("avg_search_radius", 30),
        "limit":     limit,
    }

    try:
        ranked = rank_chefs(request_params)
    except ValueError:
        # build_inference_features requires coordinates; return empty when unavailable.
        return []

    result = []
    for chef in ranked[:limit]:
        result.append({
            "chef_id":     chef.get("chef_id"),
            "score":       float(chef.get("match_score", 0)),
            "reason_code": "cold_start",
        })
    return result


def _hydrate_chefs(conn, recs: list[dict]) -> list[dict]:
    if not recs:
        return []
    chef_ids  = [r["chef_id"] for r in recs]
    score_map = {r["chef_id"]: r for r in recs}

    cursor = get_cursor(conn, dictionary=True)
    cursor.execute(_CHEF_CARD_SQL, (chef_ids,))
    rows = cursor.fetchall()
    cursor.close()

    chef_map = {r["chef_id"]: dict(r) for r in rows}
    result   = []
    for r in recs:
        cid  = r["chef_id"]
        card = chef_map.get(cid)
        if not card:
            continue
        card["score"]       = r.get("score", 0.0)
        card["reason_code"] = r.get("reason_code", "cf")
        cuisines_raw        = card.get("cuisines") or ""
        card["cuisines"]    = [c.strip() for c in cuisines_raw.split(",") if c.strip()]
        result.append(card)
    return result


def _log_recommendation(
    conn,
    customer_id: int,
    use_case: str,
    source_chef_id,
    served_chef_ids: list[int],
) -> None:
    try:
        cursor = get_cursor(conn, dictionary=False)
        cursor.execute("""
            INSERT INTO recommendation_logs
                (customer_id, use_case, source_chef_id, served_chef_ids, served_at)
            VALUES (%s, %s, %s, %s, NOW())
        """, (customer_id, use_case, source_chef_id, served_chef_ids))
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"[recommendation_service] log error (non-fatal): {e}")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_recommendations_for_customer(customer_id: int, limit: int = 10) -> dict:
    conn = None
    try:
        conn = get_db_connection()

        cached = _read_cache(conn, customer_id, limit)
        if cached:
            recs = cached
        else:
            recs_50 = _cf_recommend(customer_id, limit=50)
            if recs_50 is None:
                recs = _cold_start(conn, customer_id, limit)
            else:
                _write_cache(conn, customer_id, recs_50)
                recs = recs_50[:limit]

        chefs       = _hydrate_chefs(conn, recs)
        served_ids  = [c["chef_id"] for c in chefs]
        _log_recommendation(conn, customer_id, "for_you", None, served_ids)

        return {"use_case": "for_you", "recommendations": chefs}
    finally:
        if conn:
            conn.close()


def get_similar_chefs(chef_id: int, customer_id: int, limit: int = 10) -> dict:
    conn = None
    try:
        conn = get_db_connection()

        recs        = _cf_similar(chef_id, limit=limit)
        chefs       = _hydrate_chefs(conn, recs)
        served_ids  = [c["chef_id"] for c in chefs]
        _log_recommendation(conn, customer_id, "similar_chefs", chef_id, served_ids)

        return {"use_case": "similar_chefs", "recommendations": chefs}
    finally:
        if conn:
            conn.close()


def get_popular_menus_near(
    lat: float,
    lng: float,
    radius: float = 10,
    limit: int = 10,
) -> dict:
    conn = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        cursor.execute("""
            SELECT * FROM (
                SELECT
                    cmi.id                          AS menu_item_id,
                    cmi.name                        AS dish_name,
                    ct.name                         AS cuisine_type,
                    cmi.price_per_person            AS price,
                    c.id                            AS chef_id,
                    c.first_name,
                    c.last_name,
                    COALESCE(crs.average_rating, 0) AS chef_avg_rating,
                    COUNT(b.id)                     AS order_count,
                    (3959 * acos(
                        LEAST(1.0,
                            cos(radians(%s)) * cos(radians(ca.latitude)) *
                            cos(radians(ca.longitude) - radians(%s)) +
                            sin(radians(%s)) * sin(radians(ca.latitude))
                        )
                    ))                              AS distance_miles
                FROM chef_menu_items cmi
                JOIN chefs c          ON cmi.chef_id = c.id
                JOIN chef_addresses ca
                    ON c.id = ca.chef_id AND ca.is_default = TRUE
                LEFT JOIN cuisine_types ct      ON cmi.cuisine_id = ct.id
                LEFT JOIN bookings b
                    ON b.chef_id = c.id
                    AND b.status = 'completed'
                    AND b.created_at > NOW() - INTERVAL '90 days'
                LEFT JOIN chef_rating_summary crs ON c.id = crs.chef_id
                GROUP BY
                    cmi.id, cmi.name, ct.name, cmi.price_per_person,
                    c.id, c.first_name, c.last_name, crs.average_rating,
                    ca.latitude, ca.longitude
            ) sub
            WHERE distance_miles <= %s
            ORDER BY order_count DESC, chef_avg_rating DESC
            LIMIT %s
        """, (lat, lng, lat, radius, limit))

        rows = cursor.fetchall()
        cursor.close()

        items = []
        for r in rows:
            items.append({
                "menu_item_id": r["menu_item_id"],
                "dish_name":    r["dish_name"],
                "cuisine_type": r["cuisine_type"],
                "price":        float(r["price"] or 0),
                "order_count":  int(r["order_count"]),
                "chef": {
                    "chef_id":    r["chef_id"],
                    "first_name": r["first_name"],
                    "last_name":  r["last_name"],
                    "avg_rating": float(r["chef_avg_rating"]),
                },
            })

        return {"use_case": "popular_menus", "recommendations": items}
    finally:
        if conn:
            conn.close()
