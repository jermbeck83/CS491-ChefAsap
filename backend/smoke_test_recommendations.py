"""
Recommendation Engine smoke test.

Run from backend/:
    python smoke_test_recommendations.py

Steps:
    1. Train model on the live DB (runs train_recommendation_model as a subprocess)
    2. Call recommend_for_customer() and print top 10
    3. Call similar_chefs() and print top 10
    4. Insert a test row into recommendation_logs

Edit CUSTOMER_ID and CHEF_ID below before running.
"""

import json
import subprocess
import sys
from dotenv import load_dotenv

load_dotenv()  # picks up backend/.env

CUSTOMER_ID = 8   # change to a real customer id from your customers table
CHEF_ID     = 6   # change to a real chef id from your chefs table

if __name__ == "__main__":
    # -------------------------------------------------------------------------
    # Step 1: Train the model
    # -------------------------------------------------------------------------
    print("=" * 60)
    print("Step 1: Training recommendation model on live DB...")
    print("=" * 60)

    result = subprocess.run(
        [sys.executable, "-m", "ml.train_recommendation_model"],
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    if result.returncode != 0:
        print("Training FAILED:")
        print(result.stderr)
        sys.exit(1)

    # -------------------------------------------------------------------------
    # Step 2: Personalized recommendations
    # -------------------------------------------------------------------------
    print("=" * 60)
    print(f"Step 2: recommend_for_customer(customer_id={CUSTOMER_ID}, limit=10)")
    print("=" * 60)

    # Import after training so artifacts are on disk
    from ml.recommendation_engine import recommend_for_customer, similar_chefs

    recs = recommend_for_customer(CUSTOMER_ID, limit=10)
    if recs is None:
        print(f"Customer {CUSTOMER_ID} is cold-start (no embeddings). "
              "Assign a customer that has bookings/views.")
    else:
        print(json.dumps(recs, indent=2))

    # -------------------------------------------------------------------------
    # Step 3: Similar chefs
    # -------------------------------------------------------------------------
    print()
    print("=" * 60)
    print(f"Step 3: similar_chefs(chef_id={CHEF_ID}, limit=10)")
    print("=" * 60)

    sims = similar_chefs(CHEF_ID, limit=10)
    if not sims:
        print(f"Chef {CHEF_ID} not found in embeddings or no similar chefs.")
    else:
        print(json.dumps(sims, indent=2))

    # -------------------------------------------------------------------------
    # Step 4: Write to recommendation_logs
    # -------------------------------------------------------------------------
    print()
    print("=" * 60)
    print("Step 4: Inserting test row into recommendation_logs...")
    print("=" * 60)

    from database.db_helper import get_db_connection

    served_ids = [r["chef_id"] for r in (recs or [])]
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO recommendation_logs
                (customer_id, use_case, source_chef_id, served_chef_ids, served_at)
            VALUES (%s, %s, %s, %s, NOW())
        """, (CUSTOMER_ID, "smoke_test", None, served_ids))
        conn.commit()
        cursor.close()
        print("Logged to recommendation_logs.")
    finally:
        if conn:
            conn.close()

    # -------------------------------------------------------------------------
    # Step 5: Exercise the full service layer → verify recommendation_cache
    # -------------------------------------------------------------------------
    print()
    print("=" * 60)
    print(f"Step 5: get_recommendations_for_customer(customer_id={CUSTOMER_ID}) via service")
    print("=" * 60)

    import services.recommendation_service as svc

    service_result = svc.get_recommendations_for_customer(CUSTOMER_ID, limit=10)
    print(f"use_case:          {service_result['use_case']}")
    print(f"recommendations:   {len(service_result['recommendations'])} chef(s) returned")
    if service_result["recommendations"]:
        first = service_result["recommendations"][0]
        print(f"top result:        chef_id={first.get('chef_id')}  "
              f"reason={first.get('reason_code')}  score={first.get('score', 0):.4f}")

    conn2 = None
    try:
        conn2 = get_db_connection()
        cursor2 = conn2.cursor()

        cursor2.execute(
            "SELECT COUNT(*) FROM recommendation_cache WHERE customer_id = %s",
            (CUSTOMER_ID,),
        )
        cached_count = cursor2.fetchone()[0]
        print(f"\nrecommendation_cache rows for customer {CUSTOMER_ID}: {cached_count}")
        if cached_count > 0:
            print("Cache write: PASS")
        else:
            print("Cache write: MISS — customer may be cold-start or hydration returned 0 chefs")

        cursor2.execute(
            "SELECT served_chef_ids, served_at FROM recommendation_logs "
            "WHERE customer_id = %s ORDER BY served_at DESC LIMIT 1",
            (CUSTOMER_ID,),
        )
        log_row = cursor2.fetchone()
        if log_row:
            print(f"Latest log entry:  served_chef_ids={log_row[0]}  at={log_row[1]}")
        else:
            print("No log entry found for this customer.")

        cursor2.close()
    finally:
        if conn2:
            conn2.close()

    print()
    print("Smoke test complete.")
    print("Check pgAdmin — you should see rows in recommendation_cache and recommendation_logs.")
