import psycopg2
from psycopg2 import sql, Error
from config import db_config
from datetime import datetime
import os

def migrations_table_init():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                applied_by VARCHAR(100),
                description TEXT,
                rollback_script TEXT
            )
        ''')
        conn.commit()
        print("✅ Migrations table initialized successfully.")

    except Error as e:
        print(f"❌ Error initializing migrations table: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def record_migration(migration_name: str, description: str, rollback_script: str):
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT into migrations (migration_name, description, rollback_script)
            VALUES (%s, %s, %s)
        ''',(migration_name, description, rollback_script))
        conn.commit()
        print(f"Migration recorded : {migration_name}")
    finally:
        cursor.close()
        conn.close()

def has_migration_run(migration_name: str) -> bool:
    conn = psycopg2.connect(**db_config)
    cursor = conn.cursor()

    try:
        cursor.execute('''
            SELECT COUNT(*) FROM migrations WHERE migration_name = %s
        ''', (migration_name,))
        #get first value from tuple (contains the # of appearances of migration_name)
        count = cursor.fetchone()[0]
        #if 0 false, if 1 true
        return bool(count)
    finally:
        cursor.close()
        conn.close()

#============================= 
#Migration Functions 
#=============================

def preserve_bookings_chats():

    migration_name = "preserve_bookings_chats"
    description = "Modified foreign key constraints on bookings and chats to preserve data on user deletion."
    rollback_script = """
        ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
            ADD CONSTRAINT bookings_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;

        ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_chef_id_fkey;
            ADD CONSTRAINT bookings_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
        
        ALTER TABLE chats
            DROP CONSTRAINT IF EXISTS chats_customer_id_fkey;
            ADD CONSTRAINT chats_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
        
        ALTER TABLE chats
            DROP CONSTRAINT IF EXISTS chats_chef_id_fkey;
            ADD CONSTRAINT chats_chef_id_fkey
            FOREIGN KEY (chef_id) REFERENCES chefs(id) ON DELETE CASCADE;
        """

    if has_migration_run(migration_name): 
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Modifying foreign key constraints to preserve bookings on user deletion...")
        cursor.execute('''
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_customer_id_fkey;
        ''')

        cursor.execute('''
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
        ''')

        cursor.execute('''
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_chef_id_fkey;
        ''')

        cursor.execute('''
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_chef_id_fkey
            FOREIGN KEY (chef_id) REFERENCES chefs(id) ON DELETE SET NULL;
        ''')

        print("New bookings constraints applied successfully.")

        print("\nModifying foreign key constraints to preserve chat history on user deletion...")
        cursor.execute('''
            ALTER TABLE chats
            DROP CONSTRAINT IF EXISTS chats_customer_id_fkey;
        ''')
        cursor.execute('''
            ALTER TABLE chats
            ADD CONSTRAINT chats_customer_id_fkey
            FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL; 
        ''')
        cursor.execute('''
            ALTER TABLE chats
            DROP CONSTRAINT IF EXISTS chats_chef_id_fkey;
        ''')
        cursor.execute('''
            ALTER TABLE chats
            ADD CONSTRAINT chats_chef_id_fkey
            FOREIGN KEY (chef_id) REFERENCES chefs(id) ON DELETE SET NULL; 
        ''')

        conn.commit()

        record_migration(migration_name, description, rollback_script)

        print("New constraints applied successfully.")
    except Exception as e:
        print(f"Error modifying constraints: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def add_chef_kitchen_tools_table():

    migration_name = "add_chef_kitchen_tools_table"
    description = "Addedd table to track the kitchen tools that customers own for chef's reference"
    rollback_script = ""

    if has_migration_run(migration_name): 
        return

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()



        print("\nAdding table chef_kitchen_tools...")

        cursor.execute('''
            DROP TABLE IF EXISTS chef_kitchen_tools;
        ''')

        cursor.execute('''
                CREATE TABLE IF NOT EXISTS chef_kitchen_tools ( 
                    id SERIAL PRIMARY KEY,
                    customer_id INTEGER NOT NULL,
                    tool_name VARCHAR(100) NOT NULL,
                    tool_description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES chefs(id) ON DELETE CASCADE
                )
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)

        print("Kitchen_tools table added successfully.")
    except Exception as e:
        print(f"Error adding table: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

def create_mv_smart_matching_features():
    migration_name = "create_mv_smart_matching_features"
    description = "Creates materialized view for Smart Matching ML feature engineering. Joins bookings, ratings, views, favorites, addresses, and pricing into one row per (customer, chef) pair."
    rollback_script = "DROP MATERIALIZED VIEW IF EXISTS mv_smart_matching_features;"

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Creating materialized view mv_smart_matching_features...")
        cursor.execute('''
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_smart_matching_features AS
            SELECT
                b.customer_id,
                b.chef_id,

                -- Booking interaction features
                COUNT(b.id) AS total_bookings,
                COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS completed_bookings,
                COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bookings,
                COUNT(CASE WHEN b.status = 'declined' THEN 1 END) AS declined_bookings,
                AVG(b.total_cost) AS avg_booking_cost,
                AVG(b.number_of_people) AS avg_party_size,
                MAX(b.booking_date) AS last_booking_date,
                MIN(b.booking_date) AS first_booking_date,

                -- Rating features (chef rated by this customer)
                AVG(cr.rating) AS avg_rating_given,
                AVG(cr.food_quality_rating) AS avg_food_quality,
                AVG(cr.service_rating) AS avg_service,
                AVG(cr.punctuality_rating) AS avg_punctuality,
                BOOL_OR(cr.would_recommend) AS ever_recommended,

                -- Chef aggregate quality
                COALESCE(crs.average_rating, 0) AS chef_avg_rating,
                COALESCE(crs.total_reviews, 0) AS chef_total_reviews,

                -- Customer engagement signals
                COALESCE(vc.view_count, 0) AS profile_view_count,
                CASE WHEN fc.id IS NOT NULL THEN 1 ELSE 0 END AS is_favorited,

                -- Geographic distance (Haversine in miles)
                CASE
                    WHEN cust_addr.latitude IS NOT NULL AND chef_addr.latitude IS NOT NULL THEN
                        (3959 * acos(LEAST(1.0, GREATEST(-1.0,
                            cos(radians(cust_addr.latitude)) * cos(radians(chef_addr.latitude)) *
                            cos(radians(chef_addr.longitude) - radians(cust_addr.longitude)) +
                            sin(radians(cust_addr.latitude)) * sin(radians(chef_addr.latitude))
                        ))))
                    ELSE NULL
                END AS distance_miles,

                -- Cuisine match
                CASE WHEN EXISTS (
                    SELECT 1 FROM chef_cuisines cc
                    JOIN cuisine_types ct ON cc.cuisine_id = ct.id
                    WHERE cc.chef_id = b.chef_id AND LOWER(ct.name) = LOWER(b.cuisine_type)
                ) THEN 1 ELSE 0 END AS cuisine_match,

                -- Pricing features
                cp.base_rate_per_person,
                cp.minimum_people AS chef_min_people,
                cp.maximum_people AS chef_max_people

            FROM bookings b
            LEFT JOIN chef_ratings cr ON cr.booking_id = b.id AND cr.customer_id = b.customer_id
            LEFT JOIN chef_rating_summary crs ON crs.chef_id = b.chef_id
            LEFT JOIN customer_viewed_chefs vc ON vc.customer_id = b.customer_id AND vc.chef_id = b.chef_id
            LEFT JOIN customer_favorite_chefs fc ON fc.customer_id = b.customer_id AND fc.chef_id = b.chef_id
            LEFT JOIN customer_addresses cust_addr ON cust_addr.customer_id = b.customer_id AND cust_addr.is_default = TRUE
            LEFT JOIN chef_addresses chef_addr ON chef_addr.chef_id = b.chef_id AND chef_addr.is_default = TRUE
            LEFT JOIN chef_pricing cp ON cp.chef_id = b.chef_id
            GROUP BY b.customer_id, b.chef_id,
                     crs.average_rating, crs.total_reviews,
                     vc.view_count, fc.id,
                     cust_addr.latitude, cust_addr.longitude,
                     chef_addr.latitude, chef_addr.longitude,
                     b.cuisine_type, cp.base_rate_per_person,
                     cp.minimum_people, cp.maximum_people
        ''')

        cursor.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_smart_match
            ON mv_smart_matching_features(customer_id, chef_id)
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("mv_smart_matching_features created successfully.")

    except Exception as e:
        print(f"Error creating mv_smart_matching_features: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def create_mv_customer_preference_profile():
    migration_name = "create_mv_customer_preference_profile"
    description = "Creates materialized view for customer behavioral profiles used by the Recommendation Engine."
    rollback_script = "DROP MATERIALIZED VIEW IF EXISTS mv_customer_preference_profile;"

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Creating materialized view mv_customer_preference_profile...")
        cursor.execute('''
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_preference_profile AS
            SELECT
                c.id AS customer_id,

                -- Booking behavior aggregates
                COUNT(DISTINCT b.id) AS total_bookings,
                COUNT(DISTINCT b.chef_id) AS unique_chefs_booked,
                MODE() WITHIN GROUP (ORDER BY b.cuisine_type) AS preferred_cuisine,
                MODE() WITHIN GROUP (ORDER BY b.meal_type) AS preferred_meal_type,
                MODE() WITHIN GROUP (ORDER BY b.event_type) AS preferred_event_type,
                AVG(b.number_of_people) AS avg_party_size,
                AVG(b.total_cost) AS avg_spend,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(b.total_cost, 0)) AS median_spend,

                -- Search behavior
                COUNT(DISTINCT s.id) AS total_searches,
                MODE() WITHIN GROUP (ORDER BY s.cuisine) AS most_searched_cuisine,
                AVG(s.radius) AS avg_search_radius,
                AVG(s.results_count) AS avg_search_results,

                -- Engagement behavior
                COUNT(DISTINCT vc.chef_id) AS chefs_viewed,
                COUNT(DISTINCT fc.chef_id) AS chefs_favorited,

                -- Rating behavior
                AVG(cr.rating) AS avg_rating_given,
                COUNT(cr.id) AS total_ratings_given,

                -- Recency features
                MAX(b.booking_date) AS last_booking_date,
                MAX(s.searched_at) AS last_search_date,
                MAX(vc.viewed_at) AS last_view_date

            FROM customers c
            LEFT JOIN bookings b ON b.customer_id = c.id AND b.status IN ('completed', 'accepted')
            LEFT JOIN customer_recent_searches s ON s.customer_id = c.id
            LEFT JOIN customer_viewed_chefs vc ON vc.customer_id = c.id
            LEFT JOIN customer_favorite_chefs fc ON fc.customer_id = c.id
            LEFT JOIN chef_ratings cr ON cr.customer_id = c.id
            GROUP BY c.id
        ''')

        cursor.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cust_pref
            ON mv_customer_preference_profile(customer_id)
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("mv_customer_preference_profile created successfully.")

    except Exception as e:
        print(f"Error creating mv_customer_preference_profile: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def create_mv_demand_forecast_features():
    migration_name = "create_mv_demand_forecast_features"
    description = "Creates materialized view for Demand Forecasting ML model. Aggregates bookings by day, cuisine, meal type, and location."
    rollback_script = "DROP MATERIALIZED VIEW IF EXISTS mv_demand_forecast_features;"

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Creating materialized view mv_demand_forecast_features...")
        cursor.execute('''
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_demand_forecast_features AS
            SELECT
                DATE_TRUNC('day', b.booking_date) AS booking_day,
                EXTRACT(DOW FROM b.booking_date) AS day_of_week,
                EXTRACT(MONTH FROM b.booking_date) AS month,
                b.cuisine_type,
                b.meal_type,
                COALESCE(chef_addr.city, 'unknown') AS city,
                COALESCE(chef_addr.state, 'unknown') AS state,

                -- Demand signals
                COUNT(b.id) AS total_bookings,
                COUNT(CASE WHEN b.status = 'completed' THEN 1 END) AS completed_bookings,
                COUNT(CASE WHEN b.status = 'cancelled' THEN 1 END) AS cancelled_bookings,
                SUM(b.number_of_people) AS total_guests,
                AVG(b.total_cost) AS avg_booking_cost,
                COUNT(DISTINCT b.customer_id) AS unique_customers,
                COUNT(DISTINCT b.chef_id) AS unique_chefs

            FROM bookings b
            LEFT JOIN chef_addresses chef_addr ON chef_addr.chef_id = b.chef_id AND chef_addr.is_default = TRUE
            WHERE b.booking_date IS NOT NULL
            GROUP BY DATE_TRUNC('day', b.booking_date),
                     EXTRACT(DOW FROM b.booking_date),
                     EXTRACT(MONTH FROM b.booking_date),
                     b.cuisine_type, b.meal_type,
                     chef_addr.city, chef_addr.state
        ''')

        cursor.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_demand
            ON mv_demand_forecast_features(booking_day, cuisine_type, meal_type, city, state)
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("mv_demand_forecast_features created successfully.")

    except Exception as e:
        print(f"Error creating mv_demand_forecast_features: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def create_mv_chef_inference_features():
    migration_name = "create_mv_chef_inference_features"
    description = (
        "Creates materialized view for chef-level inference features used by the "
        "Smart Matching Engine. Stores one row per chef with cuisine, menu, "
        "availability, rating, pricing, location, and performance metrics."
    )
    rollback_script = "DROP MATERIALIZED VIEW IF EXISTS mv_chef_inference_features;"

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Creating materialized view mv_chef_inference_features...")
        cursor.execute('''
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_chef_inference_features AS
            SELECT
                c.id AS chef_id,
                c.first_name,
                c.last_name,
                COUNT(DISTINCT cc.cuisine_id) AS cuisine_count,
                ARRAY_AGG(DISTINCT LOWER(ct.name))
                    FILTER (WHERE ct.name IS NOT NULL) AS cuisine_names_lower,
                COALESCE(mi.menu_item_count, 0) AS menu_item_count,
                COALESCE(avail.meal_slots_available, 0) AS meal_slots_available,
                COALESCE(crs.average_rating, 0) AS avg_rating,
                COALESCE(crs.total_reviews, 0) AS total_reviews,
                COALESCE(perf.total_bookings, 0) AS total_bookings,
                COALESCE(perf.completed_bookings, 0) AS completed_bookings,
                COALESCE(perf.completion_rate, 0) AS completion_rate,
                cp.base_rate_per_person,
                COALESCE(cp.produce_supply_extra_cost, 0) AS produce_supply_extra_cost,
                COALESCE(cp.minimum_people, 1) AS min_people,
                COALESCE(cp.maximum_people, 50) AS max_people,
                ca.latitude,
                ca.longitude,
                LENGTH(COALESCE(c.description, '')) AS description_length
            FROM chefs c
            LEFT JOIN chef_cuisines cc ON c.id = cc.chef_id
            LEFT JOIN cuisine_types ct ON cc.cuisine_id = ct.id
            LEFT JOIN chef_addresses ca ON c.id = ca.chef_id AND ca.is_default = TRUE
            LEFT JOIN chef_pricing cp ON c.id = cp.chef_id
            LEFT JOIN chef_rating_summary crs ON c.id = crs.chef_id
            LEFT JOIN mv_chef_performance perf ON c.id = perf.chef_id
            LEFT JOIN (
                SELECT chef_id, COUNT(*) AS menu_item_count
                FROM chef_menu_items
                WHERE is_available = TRUE
                GROUP BY chef_id
            ) mi ON c.id = mi.chef_id
            LEFT JOIN (
                SELECT chef_id, COUNT(*) AS meal_slots_available
                FROM chef_meal_availability
                WHERE is_available = TRUE
                GROUP BY chef_id
            ) avail ON c.id = avail.chef_id
            WHERE ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL
            GROUP BY
                c.id, c.first_name, c.last_name,
                mi.menu_item_count, avail.meal_slots_available,
                crs.average_rating, crs.total_reviews,
                perf.total_bookings, perf.completed_bookings, perf.completion_rate,
                cp.base_rate_per_person, cp.produce_supply_extra_cost,
                cp.minimum_people, cp.maximum_people,
                ca.latitude, ca.longitude, c.description
        ''')

        cursor.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_chef_inference_features
            ON mv_chef_inference_features(chef_id)
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("mv_chef_inference_features created successfully.")

    except Exception as e:
        print(f"Error creating mv_chef_inference_features: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def create_ml_dataset_export_log():
    migration_name = "create_ml_dataset_export_log"
    description = "Creates tracking table for ML dataset exports to support reproducibility."
    rollback_script = "DROP TABLE IF EXISTS ml_dataset_export_log;"

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Creating table ml_dataset_export_log...")
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS ml_dataset_export_log (
                id SERIAL PRIMARY KEY,
                dataset_name VARCHAR(100) NOT NULL,
                export_format VARCHAR(10) NOT NULL CHECK (export_format IN ('csv', 'json')),
                row_count INTEGER,
                file_path VARCHAR(500),
                query_params JSONB,
                exported_by VARCHAR(100) DEFAULT 'system',
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
                error_message TEXT
            )
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("ml_dataset_export_log table created successfully.")

    except Exception as e:
        print(f"Error creating ml_dataset_export_log: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def allow_any_meal_type_in_bookings():
    migration_name = "allow_any_meal_type_in_bookings"
    description = (
        "Extends bookings_meal_type_check to include 'any', allowing specialty / "
        "off-hour orders whose meal_type does not fit breakfast/lunch/dinner."
    )
    rollback_script = """
        ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_meal_type_check;
        ALTER TABLE bookings
            ADD CONSTRAINT bookings_meal_type_check
            CHECK (meal_type IN ('breakfast', 'lunch', 'dinner'));
    """

    if has_migration_run(migration_name):
        return

    print(f"{'='*70}")
    print(f"\nRunning migration: {migration_name}")
    print(f"{'='*70}")

    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()

        print("Updating bookings_meal_type_check to allow 'any'...")
        cursor.execute('''
            ALTER TABLE bookings
            DROP CONSTRAINT IF EXISTS bookings_meal_type_check;
        ''')
        cursor.execute('''
            ALTER TABLE bookings
            ADD CONSTRAINT bookings_meal_type_check
            CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'any'));
        ''')

        conn.commit()
        record_migration(migration_name, description, rollback_script)
        print("bookings_meal_type_check updated successfully.")

    except Exception as e:
        print(f"Error updating bookings_meal_type_check: {e}")
        if conn:
            conn.rollback()
            print("Changes rolled back")
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def run_db_updates():
    print("="*70)
    print("Running database updates:")
    print("="*70)

    migrations_table_init()

    updates = [
        preserve_bookings_chats,
        add_chef_kitchen_tools_table,
        add_chef_kitchen_tools_table,
        create_mv_smart_matching_features,
        create_mv_customer_preference_profile,
        create_mv_demand_forecast_features,
        create_mv_chef_inference_features,
        create_ml_dataset_export_log,
        allow_any_meal_type_in_bookings,
        #add more migration functions here
    ]

    print(f"Total updates to run: {len(updates)}\n")
    for update_name in updates:
        try:
            update_name()
        except Exception as e:
            print(f"Error running: {e}")
            print("Stopping updates")
            break
    
    print("\n"+"="*70)
    print("Updates done :)")
    print("="*70)

if __name__ == "__main__":
    run_db_updates()
