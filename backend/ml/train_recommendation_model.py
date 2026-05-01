"""
Train the ChefAsap Recommendation Engine.

Fits Truncated SVD (k=32) on the weighted customer-chef interaction matrix,
then builds chef content vectors (cuisine one-hot + rating + price + region).

Usage (from backend/):
    python -m ml.train_recommendation_model
    python -m ml.train_recommendation_model --n-components 64
    python -m ml.train_recommendation_model --output-dir /tmp/models
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

import joblib
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import normalize

from database.db_helper import get_db_connection, get_cursor
from ml.feature_queries import RECOMMENDATION_DATASET_QUERY

DEFAULT_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")


def _build_interaction_matrix(rows: list[dict]):
    customer_ids_raw = [r["customer_id"] for r in rows]
    chef_ids_raw     = [r["chef_id"]     for r in rows]
    scores           = [float(r["interaction_score"]) for r in rows]

    unique_customers = sorted(set(customer_ids_raw))
    unique_chefs     = sorted(set(chef_ids_raw))

    customer_id_map = {cid: i for i, cid in enumerate(unique_customers)}
    chef_id_map     = {cid: i for i, cid in enumerate(unique_chefs)}

    customer_rows = [customer_id_map[c] for c in customer_ids_raw]
    chef_cols     = [chef_id_map[c]     for c in chef_ids_raw]

    M = csr_matrix(
        (scores, (customer_rows, chef_cols)),
        shape=(len(unique_customers), len(unique_chefs)),
    )
    return M, unique_customers, unique_chefs, customer_id_map, chef_id_map


def _build_chef_content_matrix(conn, chef_ids: list[int]):
    """Build (n_chefs × d) content matrix: cuisine one-hot + rating + price + region."""
    cursor = get_cursor(conn, dictionary=True)

    # Cuisine one-hot
    cursor.execute("""
        SELECT cc.chef_id, ct.name AS cuisine
        FROM chef_cuisines cc
        JOIN cuisine_types ct ON cc.cuisine_id = ct.id
        WHERE cc.chef_id = ANY(%s)
    """, (chef_ids,))
    cuisine_rows = cursor.fetchall()

    cuisine_vocab = sorted({r["cuisine"] for r in cuisine_rows})
    cuisine_idx   = {c: i for i, c in enumerate(cuisine_vocab)}
    chef_cuisines_map: dict[int, list[int]] = {cid: [] for cid in chef_ids}
    for r in cuisine_rows:
        cid = r["chef_id"]
        if cid in chef_cuisines_map and r["cuisine"] in cuisine_idx:
            chef_cuisines_map[cid].append(cuisine_idx[r["cuisine"]])

    # Ratings
    cursor.execute("""
        SELECT chef_id, COALESCE(average_rating, 0) AS avg_rating
        FROM chef_rating_summary
        WHERE chef_id = ANY(%s)
    """, (chef_ids,))
    rating_map = {r["chef_id"]: float(r["avg_rating"]) for r in cursor.fetchall()}

    # Pricing
    cursor.execute("""
        SELECT chef_id, COALESCE(base_rate_per_person, 0) AS rate
        FROM chef_pricing
        WHERE chef_id = ANY(%s)
    """, (chef_ids,))
    price_rows = cursor.fetchall()
    price_map  = {r["chef_id"]: float(r["rate"]) for r in price_rows}
    max_rate   = max(price_map.values(), default=1.0) or 1.0

    # Region (zip prefix)
    cursor.execute("""
        SELECT chef_id, LEFT(zip_code, 3) AS zip_prefix
        FROM chef_addresses
        WHERE chef_id = ANY(%s) AND is_default = TRUE
    """, (chef_ids,))
    region_rows  = cursor.fetchall()
    region_vocab = sorted({r["zip_prefix"] for r in region_rows if r["zip_prefix"]})
    region_idx   = {z: i for i, z in enumerate(region_vocab)}
    region_map   = {r["chef_id"]: r["zip_prefix"] for r in region_rows if r["zip_prefix"]}

    cursor.close()

    n_chefs    = len(chef_ids)
    n_cuisine  = len(cuisine_vocab)
    n_region   = len(region_vocab)
    n_features = n_cuisine + 1 + 1 + n_region  # cuisine_OH + rating + price + region_OH

    X = np.zeros((n_chefs, n_features), dtype=np.float32)
    for i, cid in enumerate(chef_ids):
        for ci in chef_cuisines_map.get(cid, []):
            X[i, ci] = 1.0
        X[i, n_cuisine]     = rating_map.get(cid, 0.0) / 5.0
        X[i, n_cuisine + 1] = price_map.get(cid, 0.0) / max_rate
        z = region_map.get(cid)
        if z and z in region_idx:
            X[i, n_cuisine + 2 + region_idx[z]] = 1.0

    # L2-normalize rows
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    X = X / norms

    return X, cuisine_vocab, region_vocab


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the ChefAsap Recommendation Engine")
    parser.add_argument("--n-components", type=int, default=32,
                        help="SVD latent factors (default: 32)")
    parser.add_argument("--output-dir", type=str, default=DEFAULT_MODEL_DIR,
                        help="Directory to save model artifacts")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    conn = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        print("Loading interaction data...")
        cursor.execute(RECOMMENDATION_DATASET_QUERY)
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            print("No interaction data found. Cannot train.")
            return

        print(f"  {len(rows)} interaction rows")

        M, unique_customers, unique_chefs, customer_id_map, chef_id_map = \
            _build_interaction_matrix(rows)

        n_customers, n_chefs = M.shape
        print(f"  {n_customers} customers × {n_chefs} chefs")

        n_components = min(args.n_components, min(n_customers, n_chefs) - 1)
        print(f"Fitting TruncatedSVD (k={n_components})...")

        svd = TruncatedSVD(n_components=n_components, random_state=42)
        customer_embeddings = svd.fit_transform(M)   # (n_customers, k)
        chef_embeddings     = svd.components_.T       # (n_chefs, k)

        customer_embeddings = normalize(customer_embeddings, norm="l2")
        chef_embeddings     = normalize(chef_embeddings,     norm="l2")

        explained = float(svd.explained_variance_ratio_.sum())
        print(f"  explained variance: {explained:.3f}")

        print("Building chef content matrix...")
        chef_content, cuisine_vocab, region_vocab = \
            _build_chef_content_matrix(conn, unique_chefs)
        print(f"  content features: {chef_content.shape[1]}")

        chef_emb_path  = os.path.join(args.output_dir, "chef_embeddings.npy")
        cust_emb_path  = os.path.join(args.output_dir, "customer_embeddings.npy")
        maps_path      = os.path.join(args.output_dir, "recommendation_id_maps.joblib")

        np.save(chef_emb_path, chef_embeddings)
        np.save(cust_emb_path, customer_embeddings)
        joblib.dump({
            "chef_id_map":     chef_id_map,
            "customer_id_map": customer_id_map,
            "chef_ids":        unique_chefs,
            "customer_ids":    unique_customers,
            "chef_content":    chef_content,
            "cuisine_vocab":   cuisine_vocab,
            "region_vocab":    region_vocab,
            "trained_at":      datetime.now(timezone.utc).isoformat(),
            "n_components":    n_components,
            "explained_variance": explained,
        }, maps_path)

        print("\n" + "=" * 60)
        print("Recommendation Engine Training Summary")
        print("=" * 60)
        print(f"Customers:         {n_customers}")
        print(f"Chefs:             {n_chefs}")
        print(f"Latent factors:    {n_components}")
        print(f"Explained variance:{explained:.3f}")
        print(f"chef_embeddings  -> {chef_emb_path}")
        print(f"customer_emb     -> {cust_emb_path}")
        print(f"id_maps          -> {maps_path}")
        print("=" * 60)

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
