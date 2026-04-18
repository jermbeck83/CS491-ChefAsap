"""
Chef ranking scorer using trained XGBoost model.
"""

import os
import joblib
import numpy as np

from database.db_helper import get_db_connection
from ml.feature_engineering import build_inference_features


MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "matching_model.joblib")


def load_model():
    if not os.path.exists(MODEL_PATH):
        return None
    return joblib.load(MODEL_PATH)


def fallback_score(feature_vector):
    """
    Simple fallback scoring if model is not available.
    Uses a basic weighted sum of important features.
    """
    # indices based on FEATURE_COLUMNS
    distance = feature_vector[6]
    rating = feature_vector[10]
    completion = feature_vector[2]

    score = (
        (rating * 2.0)
        + (completion * 1.5)
        - (distance * 0.1 if not np.isnan(distance) else 0)
    )

    return score


def rank_chefs(request_params):
    conn = None
    try:
        conn = get_db_connection()

        chef_ids, X, chef_data = build_inference_features(conn, request_params)

        if len(chef_ids) == 0:
            return []

        model = load_model()

        if model:
            scores = model.predict_proba(X)[:, 1]
            method = "model"
        else:
            scores = np.array([fallback_score(x) for x in X])
            method = "fallback"

        ranked = []
        for i in range(len(chef_ids)):
            chef = chef_data[i]
            chef["match_score"] = float(scores[i])
            chef["scoring_method"] = method
            ranked.append(chef)

        ranked.sort(key=lambda x: x["match_score"], reverse=True)

        return ranked

    finally:
        if conn:
            conn.close()