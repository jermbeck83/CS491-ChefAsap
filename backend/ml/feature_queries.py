"""
SQL query constants for ML training dataset extraction.

Each query reads from pre-computed materialized views and applies
final transformations (COALESCE, label derivation, filtering).
"""

# ============================================================
# Smart Matching Dataset
# ============================================================
# Produces labeled (customer, chef) pairs for training a matching model.
# Label: 1 = good match (completed + rated >= 3.5), 0 = bad match (only declined/cancelled)
SMART_MATCHING_DATASET_QUERY = """
    SELECT
        customer_id,
        chef_id,
        total_bookings,
        completed_bookings,
        cancelled_bookings,
        declined_bookings,
        COALESCE(avg_booking_cost, 0) AS avg_booking_cost,
        COALESCE(avg_party_size, 0) AS avg_party_size,
        COALESCE(avg_rating_given, 0) AS avg_rating_given,
        COALESCE(avg_food_quality, 0) AS avg_food_quality,
        COALESCE(avg_service, 0) AS avg_service,
        COALESCE(avg_punctuality, 0) AS avg_punctuality,
        CASE WHEN ever_recommended THEN 1 ELSE 0 END AS ever_recommended,
        chef_avg_rating,
        chef_total_reviews,
        profile_view_count,
        is_favorited,
        COALESCE(distance_miles, -1) AS distance_miles,
        cuisine_match,
        COALESCE(base_rate_per_person, 0) AS base_rate_per_person,
        COALESCE(chef_min_people, 1) AS chef_min_people,
        COALESCE(chef_max_people, 50) AS chef_max_people,

        -- Derived label for supervised learning
        CASE
            WHEN completed_bookings > 0 AND COALESCE(avg_rating_given, 3) >= 3.5 THEN 1
            WHEN completed_bookings = 0 AND (declined_bookings > 0 OR cancelled_bookings > 0) THEN 0
            ELSE NULL
        END AS match_label

    FROM mv_smart_matching_features
    WHERE total_bookings > 0
    ORDER BY customer_id, chef_id
"""


# ============================================================
# Recommendation Dataset
# ============================================================
# Produces (customer, chef, interaction_score) triples for collaborative filtering.
# Interaction score: weighted combination of bookings, ratings, views, and favorites.
RECOMMENDATION_DATASET_QUERY = """
    SELECT
        smf.customer_id,
        smf.chef_id,

        -- Customer preference features
        COALESCE(cpp.preferred_cuisine, '') AS customer_preferred_cuisine,
        COALESCE(cpp.preferred_meal_type, '') AS customer_preferred_meal_type,
        COALESCE(cpp.avg_spend, 0) AS customer_avg_spend,
        COALESCE(cpp.avg_search_radius, 10) AS customer_avg_search_radius,
        COALESCE(cpp.total_bookings, 0) AS customer_total_bookings,
        COALESCE(cpp.chefs_viewed, 0) AS customer_chefs_viewed,
        COALESCE(cpp.chefs_favorited, 0) AS customer_chefs_favorited,
        COALESCE(cpp.avg_rating_given, 0) AS customer_avg_rating_given,

        -- Chef quality features
        smf.chef_avg_rating,
        smf.chef_total_reviews,
        COALESCE(smf.base_rate_per_person, 0) AS chef_base_rate,

        -- Pair interaction features
        smf.completed_bookings,
        smf.profile_view_count,
        smf.is_favorited,
        smf.cuisine_match,
        COALESCE(smf.distance_miles, -1) AS distance_miles,
        COALESCE(smf.avg_rating_given, 0) AS pair_avg_rating,

        -- Computed interaction score (for implicit feedback models)
        (
            COALESCE(smf.completed_bookings, 0) * 5.0 +
            COALESCE(smf.profile_view_count, 0) * 0.5 +
            smf.is_favorited * 3.0 +
            COALESCE(smf.avg_rating_given, 0) * 1.0
        ) AS interaction_score

    FROM mv_smart_matching_features smf
    LEFT JOIN mv_customer_preference_profile cpp ON cpp.customer_id = smf.customer_id
    WHERE smf.total_bookings > 0 OR smf.profile_view_count > 0 OR smf.is_favorited = 1
    ORDER BY smf.customer_id, interaction_score DESC
"""


# ============================================================
# Demand Forecast Dataset
# ============================================================
# Time-series features for predicting demand by location, cuisine, and time.
# Parameterized with optional date range via %s placeholders.
DEMAND_FORECAST_DATASET_QUERY = """
    SELECT
        df.booking_day,
        df.day_of_week,
        df.month,
        df.cuisine_type,
        df.meal_type,
        df.city,
        df.state,
        df.total_bookings,
        df.completed_bookings,
        df.cancelled_bookings,
        COALESCE(df.total_guests, 0) AS total_guests,
        COALESCE(df.avg_booking_cost, 0) AS avg_booking_cost,
        df.unique_customers,
        df.unique_chefs,

        -- Search demand overlay (from geographic demand view)
        COALESCE(gd.search_volume, 0) AS search_volume,
        COALESCE(gd.zero_result_searches, 0) AS zero_result_searches

    FROM mv_demand_forecast_features df
    LEFT JOIN mv_geographic_demand gd
        ON gd.demand_date = df.booking_day
        AND LOWER(gd.location_name) = LOWER(df.city)
    WHERE (%(from_date)s IS NULL OR df.booking_day >= %(from_date)s::date)
      AND (%(to_date)s IS NULL OR df.booking_day <= %(to_date)s::date)
    ORDER BY df.booking_day, df.city, df.cuisine_type
"""

# No date filter version (for use without named parameters)
DEMAND_FORECAST_DATASET_QUERY_ALL = """
    SELECT
        df.booking_day,
        df.day_of_week,
        df.month,
        df.cuisine_type,
        df.meal_type,
        df.city,
        df.state,
        df.total_bookings,
        df.completed_bookings,
        df.cancelled_bookings,
        COALESCE(df.total_guests, 0) AS total_guests,
        COALESCE(df.avg_booking_cost, 0) AS avg_booking_cost,
        df.unique_customers,
        df.unique_chefs,

        COALESCE(gd.search_volume, 0) AS search_volume,
        COALESCE(gd.zero_result_searches, 0) AS zero_result_searches

    FROM mv_demand_forecast_features df
    LEFT JOIN mv_geographic_demand gd
        ON gd.demand_date = df.booking_day
        AND LOWER(gd.location_name) = LOWER(df.city)
    ORDER BY df.booking_day, df.city, df.cuisine_type
"""


# ============================================================
# Stats Queries (for the dataset_stats endpoint)
# ============================================================
VIEW_ROW_COUNTS_QUERY = """
    SELECT
        'smart_matching' AS dataset,
        COUNT(*) AS row_count
    FROM mv_smart_matching_features

    UNION ALL

    SELECT
        'recommendations' AS dataset,
        COUNT(*) AS row_count
    FROM mv_customer_preference_profile

    UNION ALL

    SELECT
        'demand_forecast' AS dataset,
        COUNT(*) AS row_count
    FROM mv_demand_forecast_features
"""

LAST_EXPORTS_QUERY = """
    SELECT DISTINCT ON (dataset_name)
        dataset_name,
        export_format,
        row_count,
        file_path,
        completed_at,
        status
    FROM ml_dataset_export_log
    ORDER BY dataset_name, completed_at DESC NULLS LAST
"""
