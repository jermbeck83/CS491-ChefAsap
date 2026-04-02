from flask import Blueprint, request, jsonify
from psycopg2.extras import Json
from datetime import datetime
import logging
import sys
import os


from database.db_helper import get_db_connection, get_cursor, handle_db_error

analytics_bp = Blueprint('analytics', __name__)
logger = logging.getLogger(__name__)

@analytics_bp.route('/log_event', methods=['POST'])
def log_event():
    """
    Receives behavioral events from the Android client and stores them
    in the app_events_log table for future ML training and dashboards.
    """
    conn = None
    cursor = None
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400

        
        if 'event_category' not in data or 'event_action' not in data:
            return jsonify({"error": "Missing required fields: event_category, event_action"}), 400


        event_category = data.get('event_category')
        event_action = data.get('event_action')
        actor_type = data.get('actor_type')
        actor_id = data.get('actor_id')
        session_id = data.get('session_id')
        event_data = data.get('event_data', {})

        # Use the client's timestamp if provided, otherwise default to server time
        client_timestamp = data.get('client_timestamp', datetime.utcnow().isoformat())

        
        conn = get_db_connection()
        
        cursor = get_cursor(conn)

        insert_query = """
            INSERT INTO app_events_log 
            (event_category, event_action, actor_type, actor_id, session_id, event_data, client_timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """

        # use psycopg2.extras.Json to safely parse the Python dictionary into a PostgreSQL JSONB column
        cursor.execute(insert_query, (
            event_category,
            event_action,
            actor_type,
            actor_id,
            session_id,
            Json(event_data),
            client_timestamp
        ))

        conn.commit()

        return jsonify({"status": "success", "message": "Event logged successfully"}), 201

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Unexpected error logging event: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()