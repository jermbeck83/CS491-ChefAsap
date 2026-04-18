"""
Train the ChefAsap Smart Matching model.

Usage (from backend/):
    python -m ml.train_matching_model
    python -m ml.train_matching_model --refresh-views
    python -m ml.train_matching_model --n-estimators 200
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime
from typing import Any, Dict

import joblib
import numpy as np
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from database.db_helper import get_db_connection
from ml.create_training_dataset import refresh_ml_views
from ml.feature_engineering import build_training_features


DEFAULT_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
DEFAULT_MODEL_PATH = os.path.join(DEFAULT_MODEL_DIR, "matching_model.joblib")
DEFAULT_META_PATH = os.path.join(DEFAULT_MODEL_DIR, "matching_model_meta.json")


def ensure_model_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def compute_class_distribution(y: np.ndarray) -> Dict[str, int]:
    if y.size == 0:
        return {"negative": 0, "positive": 0}

    negative = int((y == 0).sum())
    positive = int((y == 1).sum())
    return {"negative": negative, "positive": positive}


def safe_roc_auc(y_true: np.ndarray, y_prob: np.ndarray) -> float | None:
    # ROC AUC needs at least two classes present
    unique_classes = np.unique(y_true)
    if len(unique_classes) < 2:
        return None
    return float(roc_auc_score(y_true, y_prob))


def train_model(
    X: np.ndarray,
    y: np.ndarray,
    test_size: float,
    n_estimators: int,
) -> tuple[XGBClassifier, Dict[str, Any]]:
    if X.shape[0] == 0:
        raise ValueError("No training rows available. Cannot train model.")

    class_distribution = compute_class_distribution(y)
    neg_count = class_distribution["negative"]
    pos_count = class_distribution["positive"]

    if pos_count == 0:
        raise ValueError("No positive labels found. Cannot train classifier.")
    if neg_count == 0:
        raise ValueError("No negative labels found. Cannot train classifier.")

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=test_size,
        random_state=42,
        stratify=y,
    )

    scale_pos_weight = float(neg_count) / float(pos_count) if pos_count > 0 else 1.0

    model = XGBClassifier(
        n_estimators=n_estimators,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        eval_metric="logloss",
        random_state=42,
        use_label_encoder=False,
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc_roc": safe_roc_auc(y_test, y_prob),
    }

    feature_importances = model.feature_importances_.tolist()

    summary = {
        "metrics": metrics,
        "class_distribution": class_distribution,
        "train_rows": int(X_train.shape[0]),
        "test_rows": int(X_test.shape[0]),
        "feature_importances": feature_importances,
    }

    return model, summary


def save_metadata(
    meta_path: str,
    feature_names: list[str],
    dataset_size: int,
    training_summary: Dict[str, Any],
    low_confidence: bool,
) -> None:
    metadata = {
        "feature_names": feature_names,
        "training_timestamp": datetime.utcnow().isoformat() + "Z",
        "dataset_size": int(dataset_size),
        "metrics": training_summary["metrics"],
        "class_distribution": training_summary["class_distribution"],
        "train_rows": training_summary["train_rows"],
        "test_rows": training_summary["test_rows"],
        "feature_importances": training_summary["feature_importances"],
        "low_confidence": low_confidence,
        "model_type": "xgboost_v1",
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the ChefAsap Smart Matching model")
    parser.add_argument(
        "--refresh-views",
        action="store_true",
        help="Refresh ML materialized views before training",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=DEFAULT_MODEL_DIR,
        help="Directory to save the trained model and metadata",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.2,
        help="Test split ratio (default: 0.2)",
    )
    parser.add_argument(
        "--n-estimators",
        type=int,
        default=100,
        help="Number of XGBoost trees (default: 100)",
    )

    args = parser.parse_args()

    model_dir = ensure_model_dir(args.output_dir)
    model_path = os.path.join(model_dir, "matching_model.joblib")
    meta_path = os.path.join(model_dir, "matching_model_meta.json")

    conn = None
    try:
        conn = get_db_connection()

        if args.refresh_views:
            refresh_ml_views(conn)
            conn.close()
            conn = get_db_connection()

        X, y, feature_names = build_training_features(conn)

        print("\n" + "=" * 70)
        print("Smart Matching Training Summary")
        print("=" * 70)
        print(f"Training rows: {X.shape[0]}")
        print(f"Feature count: {X.shape[1] if X.ndim == 2 else 0}")
        print(f"Feature names: {feature_names}")

        class_distribution = compute_class_distribution(y)
        print(f"Class distribution: {class_distribution}")

        low_confidence = X.shape[0] < 50
        if low_confidence:
            print("WARNING: Fewer than 50 labeled rows found. Model will be marked low_confidence.")

        model, training_summary = train_model(
            X=X,
            y=y,
            test_size=args.test_size,
            n_estimators=args.n_estimators,
        )

        print("\nMetrics:")
        for key, value in training_summary["metrics"].items():
            print(f"  {key}: {value}")

        print("\nSaving model...")
        joblib.dump(model, model_path)
        save_metadata(
            meta_path=meta_path,
            feature_names=feature_names,
            dataset_size=X.shape[0],
            training_summary=training_summary,
            low_confidence=low_confidence,
        )

        print(f"Model saved to: {model_path}")
        print(f"Metadata saved to: {meta_path}")
        print("=" * 70)

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    main()