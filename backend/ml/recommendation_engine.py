"""
Recommendation engine inference: collaborative filtering + content similarity.

Artifacts are loaded lazily from backend/ml/models/:
  chef_embeddings.npy           (n_chefs × k, L2-normalized)
  customer_embeddings.npy       (n_customers × k, L2-normalized)
  recommendation_id_maps.joblib {chef_id_map, customer_id_map, chef_ids,
                                  customer_ids, chef_content, cuisine_vocab}

Train artifacts with:
    python -m ml.train_recommendation_model
"""

from __future__ import annotations

import os

import joblib
import numpy as np

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
_CHEF_EMB_PATH = os.path.join(MODELS_DIR, "chef_embeddings.npy")
_CUST_EMB_PATH = os.path.join(MODELS_DIR, "customer_embeddings.npy")
_ID_MAPS_PATH  = os.path.join(MODELS_DIR, "recommendation_id_maps.joblib")

_artifacts = None


def _load_artifacts():
    global _artifacts
    if _artifacts is not None:
        return _artifacts
    if not all(os.path.exists(p) for p in [_CHEF_EMB_PATH, _CUST_EMB_PATH, _ID_MAPS_PATH]):
        return None
    maps = joblib.load(_ID_MAPS_PATH)
    _artifacts = {
        "chef_embeddings":  np.load(_CHEF_EMB_PATH),
        "customer_embeddings": np.load(_CUST_EMB_PATH),
        "chef_id_map":      maps["chef_id_map"],
        "customer_id_map":  maps["customer_id_map"],
        "chef_ids":         maps["chef_ids"],
        "chef_content":     maps["chef_content"],
    }
    return _artifacts


def recommend_for_customer(
    customer_id: int,
    limit: int = 10,
    exclude_chef_ids: list[int] | None = None,
) -> list[dict] | None:
    """
    Top-limit chef recommendations for customer_id using collaborative filtering.
    Returns None when customer has no interaction history (caller handles cold-start).
    """
    art = _load_artifacts()
    if art is None:
        return None

    idx = art["customer_id_map"].get(customer_id)
    if idx is None:
        return None

    scores = art["chef_embeddings"] @ art["customer_embeddings"][idx]

    if exclude_chef_ids:
        for cid in exclude_chef_ids:
            row = art["chef_id_map"].get(cid)
            if row is not None:
                scores[row] = -np.inf

    finite_count = int((scores > -np.inf).sum())
    k = min(limit, finite_count)
    if k == 0:
        return []

    if k >= len(scores):
        top = np.argsort(-scores)[:k]
    else:
        top = np.argpartition(-scores, k)[:k]
        top = top[np.argsort(-scores[top])]

    return [
        {"chef_id": int(art["chef_ids"][i]), "score": float(scores[i]), "reason_code": "cf"}
        for i in top
    ]


def similar_chefs(chef_id: int, limit: int = 10) -> list[dict]:
    """
    Top-limit chefs similar to chef_id, blending CF similarity with content similarity.
    Returns [] when chef is not in the embedding map or artifacts are missing.
    """
    art = _load_artifacts()
    if art is None:
        return []

    idx = art["chef_id_map"].get(chef_id)
    if idx is None:
        return []

    cf_sim      = art["chef_embeddings"] @ art["chef_embeddings"][idx]
    content_sim = art["chef_content"]    @ art["chef_content"][idx]

    cf_weight = float(os.environ.get("RECOMMENDATION_CF_WEIGHT", "0.5"))
    blended = cf_weight * cf_sim + (1.0 - cf_weight) * content_sim
    blended[idx] = -np.inf  # exclude self

    k = min(limit, len(blended) - 1)
    if k <= 0:
        return []

    if k >= len(blended):
        top = np.argsort(-blended)[:k]
    else:
        top = np.argpartition(-blended, k)[:k]
        top = top[np.argsort(-blended[top])]

    return [
        {"chef_id": int(art["chef_ids"][i]), "score": float(blended[i]), "reason_code": "similar"}
        for i in top
    ]
