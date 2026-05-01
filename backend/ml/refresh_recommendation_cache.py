"""
Nightly recommendation cache refresh.

For each active customer (booking in last 90 days), computes top-50
recommendations and upserts them into recommendation_cache.

Usage (from backend/):
    python -m ml.refresh_recommendation_cache
"""

from __future__ import annotations

from database.db_helper import get_db_connection, get_cursor
from ml.recommendation_engine import recommend_for_customer


def _get_active_customer_ids(conn) -> list[int]:
    cursor = get_cursor(conn, dictionary=True)
    cursor.execute("""
        SELECT DISTINCT customer_id
        FROM bookings
        WHERE created_at > NOW() - INTERVAL '90 days'
        UNION
        SELECT DISTINCT customer_id
        FROM recommendation_logs
        WHERE served_at > NOW() - INTERVAL '90 days'
    """)
    rows = cursor.fetchall()
    cursor.close()
    return [r["customer_id"] for r in rows]


def _upsert_cache(conn, customer_id: int, recs: list[dict]) -> None:
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


def refresh_cache() -> None:
    conn = None
    try:
        conn = get_db_connection()
        customer_ids = _get_active_customer_ids(conn)
        print(f"Active customers to refresh: {len(customer_ids)}")

        updated = 0
        skipped = 0
        for customer_id in customer_ids:
            recs = recommend_for_customer(customer_id, limit=50)
            if recs is None:
                skipped += 1
                continue
            _upsert_cache(conn, customer_id, recs)
            updated += 1

        print(f"Updated: {updated}  |  Skipped (cold-start / no embeddings): {skipped}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    refresh_cache()
