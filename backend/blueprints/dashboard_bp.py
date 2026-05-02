from flask import Blueprint, jsonify
import logging
from database.db_helper import get_db_connection, get_cursor

dashboard_bp = Blueprint('dashboard', __name__)
logger = logging.getLogger(__name__)

@dashboard_bp.route('/metrics/chef-performance', methods=['GET'])
def get_chef_performance():
    """Fetches top-performing chefs for the admin dashboard."""

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Direct Materialized View Query
        cursor.execute('''
            SELECT chef_id, first_name, total_bookings, completion_rate, average_rating
            FROM mv_chef_performance
            ORDER BY total_bookings DESC
            LIMIT 10
        ''')
        data = cursor.fetchall()
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        logger.error(f"Error fetching chef metrics: {e}")
        return jsonify({"error": "Failed to fetch metrics"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@dashboard_bp.route('/metrics/unmet-demand', methods=['GET'])
def get_unmet_demand():
    """Identifies locations where customers are searching but finding nothing."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Querying the other Materialized View
        cursor.execute('''
            SELECT location_name, SUM(zero_result_searches) as missed_opportunities
            FROM mv_geographic_demand
            WHERE demand_date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY location_name
            ORDER BY missed_opportunities DESC
            LIMIT 5
        ''')
        data = cursor.fetchall()
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        logger.error(f"Error fetching demand metrics: {e}")
        return jsonify({"error": "Failed to fetch demand data"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

@dashboard_bp.route('/metrics/recent-bookings', methods=['GET'])
def get_recent_bookings():
    """Fetches recent bookings, specifically including fraud metadata for the Fraud Desk."""
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Query recent bookings, including the fraud metadata we just added
        cursor.execute('''
            SELECT 
                b.id as booking_id, 
                b.customer_id, 
                b.chef_id, 
                b.total_cost, 
                b.status,
                b.fraud_score, 
                b.fraud_flags, 
                b.is_flagged_fraud,
                b.created_at
            FROM bookings b
            ORDER BY b.created_at DESC
            LIMIT 50
        ''')
        data = cursor.fetchall()
        
        # Ensure fraud_score is a float for the frontend parser
        for row in data:
            if row['fraud_score'] is not None:
                row['fraud_score'] = float(row['fraud_score'])
            
        return jsonify({"status": "success", "data": data}), 200

    except Exception as e:
        logger.error(f"Error fetching recent bookings: {e}")
        return jsonify({"error": "Failed to fetch recent bookings"}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
        