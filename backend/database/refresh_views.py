import logging
from database.db_helper import get_db_connection, get_cursor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def refresh_analytics_views():
    """
    Refreshes the materialized views for the admin dashboard.
    Runs concurrently so it doesn't lock the tables during reads.

    """
    logger.info("Starting Materialized View refresh...")
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        # set isolation level to autocommit to run CONCURRENTLY
        conn.autocommit = True
        cursor = get_cursor(conn)

        # Refresh Performance Metrics
        logger.info("Refreshing mv_chef_performance...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_chef_performance;')
        logger.info("Refreshing mv_chef_inference_features...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_chef_inference_features;')

        # Refresh Geographic Demand
        logger.info("Refreshing mv_geographic_demand...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_geographic_demand;')

        # Refresh ML Training Dataset Views
        logger.info("Refreshing mv_smart_matching_features...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_smart_matching_features;')

        logger.info("Refreshing mv_customer_preference_profile...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_preference_profile;')

        logger.info("Refreshing mv_demand_forecast_features...")
        cursor.execute('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_demand_forecast_features;')

        logger.info(" All materialized views refreshed successfully.")

    except Exception as e:
        logger.error(f" Error refreshing views: {e}")
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == "__main__":
    refresh_analytics_views()