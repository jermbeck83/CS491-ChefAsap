"""
Feature engineering utilities for the ChefAsap Smart Matching Engine.

This module provides a single source of truth for:
- model feature ordering
- training feature construction
- inference feature construction

Both training and inference must use the exact same feature order.
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from database.db_helper import get_cursor


# Single source of truth for model feature ordering
FEATURE_COLUMNS = [
    # 1. Chef skills
    "chef_cuisine_count",
    "chef_menu_item_count",
    "chef_completion_rate",
    "chef_total_bookings",
    "chef_description_length",

    # 2. Cuisine tags
    "cuisine_match",

    # 3. Distance
    "distance_miles",

    # 4. Availability
    "meal_type_available",
    "day_of_week_available",
    "chef_meal_slots_available",

    # 5. Ratings
    "chef_avg_rating",
    "chef_total_reviews",
    "pair_avg_rating_given",
    "pair_ever_recommended",

    # 6. Customer preferences
    "customer_total_bookings",
    "is_favorited",
    "profile_view_count",
    "pair_completed_bookings",

    # 7. Price sensitivity
    "base_rate_per_person",
    "estimated_total_cost",
    "price_to_budget_ratio",
    "party_size_fit",
    "party_size_ratio",
]


def parse_day_of_week(booking_date: Any) -> Optional[str]:
    """
    Convert booking_date into a lowercase weekday string like 'monday'.

    Accepts:
    - datetime/date objects
    - ISO date strings (YYYY-MM-DD)
    """
    if booking_date is None:
        return None

    if hasattr(booking_date, "strftime"):
        return booking_date.strftime("%A").lower()

    if isinstance(booking_date, str):
        try:
            return datetime.fromisoformat(booking_date).strftime("%A").lower()
        except ValueError:
            return None

    return None


def clamp(value: float, minimum: float, maximum: float) -> float:
    """Clamp a numeric value into a closed interval."""
    return max(minimum, min(value, maximum))


def _compute_feature_vector(
    chef_row: Dict[str, Any],
    pair_row: Optional[Dict[str, Any]],
    customer_row: Optional[Dict[str, Any]],
    request_params: Dict[str, Any],
) -> List[float]:
    """
    Build one 22-feature vector in FEATURE_COLUMNS order.

    chef_row: one chef candidate / one joined training row
    pair_row: customer-chef interaction history, if any
    customer_row: customer profile row, if any
    request_params: live request context or reconstructed training context
    """
    pair_row = pair_row or {}
    customer_row = customer_row or {}

    cuisine_names_lower = chef_row.get("cuisine_names_lower") or []
    request_cuisine = (request_params.get("cuisine_type") or "").strip().lower()

    party_size = request_params.get("party_size") or 0
    meal_type = (request_params.get("meal_type") or "").strip().lower()
    max_budget = request_params.get("max_budget")
    booking_day = parse_day_of_week(request_params.get("booking_date"))

    base_rate = chef_row.get("base_rate_per_person")
    max_people = chef_row.get("max_people") or 50
    min_people = chef_row.get("min_people") or 1
    distance_miles = chef_row.get("distance_miles")

    estimated_total_cost = float(base_rate) * float(party_size) if base_rate is not None and party_size else float("nan")

    # Prefer explicit budget. If missing, fall back to customer avg spend.
    budget_reference = max_budget if max_budget not in (None, 0) else customer_row.get("avg_spend")

    if budget_reference not in (None, 0) and estimated_total_cost == estimated_total_cost:
        price_to_budget_ratio = clamp(float(estimated_total_cost) / float(budget_reference), 0.0, 5.0)
    else:
        price_to_budget_ratio = float("nan")

    cuisine_match = 1 if request_cuisine and request_cuisine in cuisine_names_lower else 0
    meal_type_available = 1 if meal_type and meal_type in (chef_row.get("available_meal_types") or set()) else 0
    day_of_week_available = 1 if booking_day and booking_day in (chef_row.get("available_days") or set()) else 0
    party_size_fit = 1 if party_size and min_people <= party_size <= max_people else 0
    party_size_ratio = float(party_size) / float(max_people) if max_people not in (None, 0) and party_size else 0.0

    feature_map = {
        "chef_cuisine_count": float(chef_row.get("cuisine_count") or 0),
        "chef_menu_item_count": float(chef_row.get("menu_item_count") or 0),
        "chef_completion_rate": float(chef_row.get("completion_rate") or 0),
        "chef_total_bookings": float(chef_row.get("total_bookings") or 0),
        "chef_description_length": float(chef_row.get("description_length") or 0),

        "cuisine_match": float(cuisine_match),

        "distance_miles": float(distance_miles) if distance_miles is not None else float("nan"),

        "meal_type_available": float(meal_type_available),
        "day_of_week_available": float(day_of_week_available),
        "chef_meal_slots_available": float(chef_row.get("meal_slots_available") or 0),

        "chef_avg_rating": float(chef_row.get("avg_rating") or 0),
        "chef_total_reviews": float(chef_row.get("total_reviews") or 0),
        "pair_avg_rating_given": float(pair_row.get("avg_rating_given") or 0),
        "pair_ever_recommended": float(pair_row.get("ever_recommended") or 0),

        "customer_total_bookings": float(customer_row.get("total_bookings") or 0),
        "is_favorited": float(pair_row.get("is_favorited") or 0),
        "profile_view_count": float(pair_row.get("profile_view_count") or 0),
        "pair_completed_bookings": float(pair_row.get("completed_bookings") or 0),

        "base_rate_per_person": float(base_rate) if base_rate is not None else float("nan"),
        "estimated_total_cost": float(estimated_total_cost) if estimated_total_cost == estimated_total_cost else float("nan"),
        "price_to_budget_ratio": float(price_to_budget_ratio) if price_to_budget_ratio == price_to_budget_ratio else float("nan"),
        "party_size_fit": float(party_size_fit),
        "party_size_ratio": float(party_size_ratio),
    }

    return [feature_map[col] for col in FEATURE_COLUMNS]


def build_training_features(conn) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    Build labeled training features for the matching model.

    Returns:
        X: feature matrix
        y: labels
        feature_names: ordered feature names
    """
    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=True)

        cursor.execute("""
            SELECT
                smf.customer_id,
                smf.chef_id,

                -- Pair history
                smf.completed_bookings,
                smf.cancelled_bookings,
                smf.declined_bookings,
                smf.avg_rating_given,
                CASE WHEN smf.ever_recommended THEN 1 ELSE 0 END AS ever_recommended,
                smf.profile_view_count,
                smf.is_favorited,
                smf.distance_miles,

                -- Chef-level inference features
                cif.cuisine_count,
                cif.cuisine_names_lower,
                cif.menu_item_count,
                cif.meal_slots_available,
                cif.avg_rating,
                cif.total_reviews,
                cif.total_bookings,
                cif.completed_bookings AS chef_completed_bookings,
                cif.completion_rate,
                cif.base_rate_per_person,
                cif.produce_supply_extra_cost,
                cif.min_people,
                cif.max_people,
                cif.latitude,
                cif.longitude,
                cif.description_length,

                -- Customer profile
                cpp.total_bookings AS customer_total_bookings,
                cpp.avg_spend,
                cpp.avg_party_size AS customer_avg_party_size,
                cpp.preferred_cuisine,
                cpp.preferred_meal_type,

                -- Reconstructed request context from historical booking behavior
                CASE
                    WHEN smf.avg_party_size IS NOT NULL AND smf.avg_party_size > 0
                    THEN ROUND(smf.avg_party_size)::int
                    ELSE 1
                END AS request_party_size,

                CASE
                    WHEN cpp.preferred_meal_type IS NOT NULL AND cpp.preferred_meal_type <> ''
                    THEN cpp.preferred_meal_type
                    ELSE 'dinner'
                END AS request_meal_type,

                CASE
                    WHEN cpp.preferred_cuisine IS NOT NULL AND cpp.preferred_cuisine <> ''
                    THEN cpp.preferred_cuisine
                    ELSE NULL
                END AS request_cuisine_type,

                smf.last_booking_date AS request_booking_date,

                CASE
                    WHEN smf.base_rate_per_person IS NOT NULL
                         AND smf.avg_party_size IS NOT NULL
                         AND smf.avg_party_size > 0
                    THEN smf.base_rate_per_person * smf.avg_party_size
                    ELSE cpp.avg_spend
                END AS request_max_budget,

                -- Label
                CASE
                    WHEN smf.completed_bookings > 0 AND COALESCE(smf.avg_rating_given, 3) >= 3.5 THEN 1
                    WHEN smf.completed_bookings = 0 AND (smf.declined_bookings > 0 OR smf.cancelled_bookings > 0) THEN 0
                    ELSE NULL
                END AS match_label

            FROM mv_smart_matching_features smf
            INNER JOIN mv_chef_inference_features cif
                ON smf.chef_id = cif.chef_id
            LEFT JOIN mv_customer_preference_profile cpp
                ON smf.customer_id = cpp.customer_id
            WHERE smf.total_bookings > 0
            ORDER BY smf.customer_id, smf.chef_id
        """)

        rows = cursor.fetchall()

        X_rows: List[List[float]] = []
        y_rows: List[int] = []

        for row in rows:
            match_label = row.get("match_label")
            if match_label is None:
                continue

            chef_row = {
                "cuisine_count": row.get("cuisine_count"),
                "cuisine_names_lower": row.get("cuisine_names_lower") or [],
                "menu_item_count": row.get("menu_item_count"),
                "meal_slots_available": row.get("meal_slots_available"),
                "avg_rating": row.get("avg_rating"),
                "total_reviews": row.get("total_reviews"),
                "total_bookings": row.get("total_bookings"),
                "completed_bookings": row.get("chef_completed_bookings"),
                "completion_rate": row.get("completion_rate"),
                "base_rate_per_person": row.get("base_rate_per_person"),
                "produce_supply_extra_cost": row.get("produce_supply_extra_cost"),
                "min_people": row.get("min_people"),
                "max_people": row.get("max_people"),
                "latitude": row.get("latitude"),
                "longitude": row.get("longitude"),
                "description_length": row.get("description_length"),
                "distance_miles": row.get("distance_miles"),

                # Training data does not reconstruct exact historical availability yet.
                # Keep these empty for now; tomorrow we can improve if needed.
                "available_meal_types": set(),
                "available_days": set(),
            }

            pair_row = {
                "avg_rating_given": row.get("avg_rating_given"),
                "ever_recommended": row.get("ever_recommended"),
                "is_favorited": row.get("is_favorited"),
                "profile_view_count": row.get("profile_view_count"),
                "completed_bookings": row.get("completed_bookings"),
            }

            customer_row = {
                "total_bookings": row.get("customer_total_bookings"),
                "avg_spend": row.get("avg_spend"),
                "avg_party_size": row.get("customer_avg_party_size"),
                "preferred_cuisine": row.get("preferred_cuisine"),
                "preferred_meal_type": row.get("preferred_meal_type"),
            }

            request_params = {
                "party_size": row.get("request_party_size"),
                "meal_type": row.get("request_meal_type"),
                "cuisine_type": row.get("request_cuisine_type"),
                "booking_date": row.get("request_booking_date"),
                "max_budget": row.get("request_max_budget"),
            }

            feature_vector = _compute_feature_vector(
                chef_row=chef_row,
                pair_row=pair_row,
                customer_row=customer_row,
                request_params=request_params,
            )

            X_rows.append(feature_vector)
            y_rows.append(int(match_label))

        X = np.array(X_rows, dtype=float) if X_rows else np.empty((0, len(FEATURE_COLUMNS)), dtype=float)
        y = np.array(y_rows, dtype=int) if y_rows else np.empty((0,), dtype=int)

        return X, y, FEATURE_COLUMNS

    finally:
        if cursor:
            cursor.close()


def build_inference_features(conn, request_params: Dict[str, Any]):
    """
    Build inference features for live chef ranking.

    request_params expected keys:
        customer_id (optional)
        latitude (required)
        longitude (required)
        cuisine_type (optional)
        meal_type (optional)
        party_size (optional)
        booking_date (optional)
        max_budget (optional)
        radius (optional, default 30)

    Returns:
        chef_ids: list[int]
        X: feature matrix
        chef_data: list[dict]
    """
    customer_id = request_params.get("customer_id")
    latitude = request_params.get("latitude")
    longitude = request_params.get("longitude")
    radius = request_params.get("radius", 30)

    if latitude is None or longitude is None:
        raise ValueError("latitude and longitude are required for inference feature building")

    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=True)

        # 1. Candidate chef query using the chef inference materialized view
        cursor.execute(
            """
            SELECT
                cif.chef_id,
                cif.first_name,
                cif.last_name,
                cif.cuisine_count,
                cif.cuisine_names_lower,
                cif.menu_item_count,
                cif.meal_slots_available,
                cif.avg_rating,
                cif.total_reviews,
                cif.total_bookings,
                cif.completed_bookings,
                cif.completion_rate,
                cif.base_rate_per_person,
                cif.produce_supply_extra_cost,
                cif.min_people,
                cif.max_people,
                cif.latitude,
                cif.longitude,
                cif.description_length,

                (3959 * acos(
                    LEAST(1.0, GREATEST(-1.0,
                        cos(radians(%s)) * cos(radians(cif.latitude)) *
                        cos(radians(cif.longitude) - radians(%s)) +
                        sin(radians(%s)) * sin(radians(cif.latitude))
                    ))
                )) AS distance_miles

            FROM mv_chef_inference_features cif
            WHERE cif.latitude IS NOT NULL
              AND cif.longitude IS NOT NULL
            """,
            (latitude, longitude, latitude),
        )

        candidate_rows = cursor.fetchall()

        # Filter by radius in Python to keep query simple and safe
        candidate_rows = [
            row for row in candidate_rows
            if row.get("distance_miles") is not None and float(row["distance_miles"]) <= float(radius)
        ]

        if not candidate_rows:
            return [], np.empty((0, len(FEATURE_COLUMNS)), dtype=float), []

        chef_ids = [row["chef_id"] for row in candidate_rows]

        # 2. Batch-load meal availability
        cursor.execute(
            """
            SELECT chef_id, LOWER(meal_type) AS meal_type
            FROM chef_meal_availability
            WHERE chef_id = ANY(%s)
              AND is_available = TRUE
            """,
            (chef_ids,),
        )
        meal_rows = cursor.fetchall()

        meal_map: Dict[int, set] = {}
        for row in meal_rows:
            meal_map.setdefault(row["chef_id"], set()).add(row["meal_type"])

        # 3. Batch-load day-of-week availability
        cursor.execute(
            """
            SELECT chef_id, LOWER(day_of_week) AS day_of_week, LOWER(meal_type) AS meal_type
            FROM chef_availability_days
            WHERE chef_id = ANY(%s)
            """,
            (chef_ids,),
        )
        day_rows = cursor.fetchall()

        day_map: Dict[int, set] = {}
        day_meal_map: Dict[int, set] = {}
        for row in day_rows:
            chef_id_row = row["chef_id"]
            if row.get("day_of_week"):
                day_map.setdefault(chef_id_row, set()).add(row["day_of_week"])
            if row.get("day_of_week") and row.get("meal_type"):
                day_meal_map.setdefault(chef_id_row, set()).add(
                    (row["day_of_week"], row["meal_type"])
                )

        # 4. Batch-load pair history if customer_id exists
        pair_map: Dict[int, Dict[str, Any]] = {}
        customer_row: Optional[Dict[str, Any]] = None

        if customer_id is not None:
            cursor.execute(
                """
                SELECT
                    chef_id,
                    completed_bookings,
                    cancelled_bookings,
                    declined_bookings,
                    avg_rating_given,
                    CASE WHEN ever_recommended THEN 1 ELSE 0 END AS ever_recommended,
                    profile_view_count,
                    is_favorited
                FROM mv_smart_matching_features
                WHERE customer_id = %s
                  AND chef_id = ANY(%s)
                """,
                (customer_id, chef_ids),
            )
            pair_rows = cursor.fetchall()
            pair_map = {row["chef_id"]: row for row in pair_rows}

            # 5. Load customer profile if customer_id exists
            cursor.execute(
                """
                SELECT
                    customer_id,
                    total_bookings,
                    avg_spend,
                    avg_party_size,
                    preferred_cuisine,
                    preferred_meal_type
                FROM mv_customer_preference_profile
                WHERE customer_id = %s
                """,
                (customer_id,),
            )
            customer_row = cursor.fetchone()

        X_rows: List[List[float]] = []
        chef_data: List[Dict[str, Any]] = []

        request_meal_type = (request_params.get("meal_type") or "").strip().lower()
        request_day = parse_day_of_week(request_params.get("booking_date"))

        for chef_row in candidate_rows:
            chef_id = chef_row["chef_id"]

            available_meal_types = meal_map.get(chef_id, set())
            available_days = day_map.get(chef_id, set())
            available_day_meal_pairs = day_meal_map.get(chef_id, set())

            # Respect both general day availability and meal/day combo when possible
            day_of_week_available = 0
            if request_day:
                if request_meal_type:
                    day_of_week_available = 1 if (request_day, request_meal_type) in available_day_meal_pairs else 0
                else:
                    day_of_week_available = 1 if request_day in available_days else 0

            enriched_chef_row = dict(chef_row)
            enriched_chef_row["available_meal_types"] = available_meal_types
            enriched_chef_row["available_days"] = available_days

            pair_row = pair_map.get(chef_id, {})

            feature_vector = _compute_feature_vector(
                chef_row=enriched_chef_row,
                pair_row=pair_row,
                customer_row=customer_row,
                request_params=request_params,
            )

            # Override day_of_week_available slot using more exact combo logic when available
            if "day_of_week_available" in FEATURE_COLUMNS:
                idx = FEATURE_COLUMNS.index("day_of_week_available")
                feature_vector[idx] = float(day_of_week_available)

            X_rows.append(feature_vector)

            estimated_total_cost = (
                float(chef_row["base_rate_per_person"]) * float(request_params.get("party_size"))
                if chef_row.get("base_rate_per_person") is not None and request_params.get("party_size")
                else None
            )

            chef_data.append({
                "chef_id": chef_id,
                "first_name": chef_row.get("first_name"),
                "last_name": chef_row.get("last_name"),
                "distance_miles": float(chef_row["distance_miles"]) if chef_row.get("distance_miles") is not None else None,
                "cuisines": chef_row.get("cuisine_names_lower") or [],
                "rating": {
                    "average_rating": float(chef_row["avg_rating"]) if chef_row.get("avg_rating") is not None else 0.0,
                    "total_reviews": int(chef_row.get("total_reviews") or 0),
                },
                "pricing": {
                    "base_rate_per_person": float(chef_row["base_rate_per_person"]) if chef_row.get("base_rate_per_person") is not None else None,
                    "estimated_total_cost": estimated_total_cost,
                    "minimum_people": int(chef_row.get("min_people") or 1),
                    "maximum_people": int(chef_row.get("max_people") or 50),
                    "produce_supply_extra_cost": float(chef_row["produce_supply_extra_cost"]) if chef_row.get("produce_supply_extra_cost") is not None else 0.0,
                },
                "availability": {
                    "meal_type_available": request_meal_type in available_meal_types if request_meal_type else False,
                    "day_of_week_available": bool(day_of_week_available),
                    "available_meal_types": sorted(list(available_meal_types)),
                    "available_days": sorted(list(available_days)),
                },
            })

        X = np.array(X_rows, dtype=float) if X_rows else np.empty((0, len(FEATURE_COLUMNS)), dtype=float)

        return chef_ids, X, chef_data

    finally:
        if cursor:
            cursor.close()