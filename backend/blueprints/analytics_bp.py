from flask import Blueprint, request, jsonify
from psycopg2.extras import Json
from datetime import datetime
import logging
import sys
import os


from database.db_helper import get_db_connection, get_cursor, handle_db_error
from ml.feature_queries import VIEW_ROW_COUNTS_QUERY, LAST_EXPORTS_QUERY
from ml.create_training_dataset import (
    generate_smart_matching_dataset,
    generate_recommendation_dataset,
    generate_demand_forecast_dataset,
    generate_all_datasets,
    refresh_ml_views,
)
from ml.exporters import ensure_export_dir

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


@analytics_bp.route('/export_dataset', methods=['POST'])
def export_dataset():
    """
    Triggers on-demand ML dataset generation and export.
    Request body:
        {
            "dataset": "smart_matching" | "recommendations" | "demand_forecast" | "all",
            "format": "csv" | "json",
            "from_date": "YYYY-MM-DD" (optional, demand_forecast only),
            "to_date": "YYYY-MM-DD" (optional, demand_forecast only),
            "refresh_views": true/false (optional)
        }
    """
    conn = None
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No JSON payload provided"}), 400

        dataset = data.get('dataset', 'all')
        export_format = data.get('format', 'csv')
        from_date = data.get('from_date')
        to_date = data.get('to_date')
        should_refresh = data.get('refresh_views', False)

        valid_datasets = ['smart_matching', 'recommendations', 'demand_forecast', 'all']
        if dataset not in valid_datasets:
            return jsonify({"error": f"Invalid dataset. Choose from: {valid_datasets}"}), 400

        if export_format not in ('csv', 'json'):
            return jsonify({"error": "Invalid format. Choose 'csv' or 'json'"}), 400

        conn = get_db_connection()

        if should_refresh:
            refresh_ml_views(conn)
            conn.close()
            conn = get_db_connection()

        if dataset == 'all':
            results = generate_all_datasets(conn, export_format, None, from_date, to_date)
        elif dataset == 'smart_matching':
            results = [generate_smart_matching_dataset(conn, export_format)]
        elif dataset == 'recommendations':
            results = [generate_recommendation_dataset(conn, export_format)]
        elif dataset == 'demand_forecast':
            results = [generate_demand_forecast_dataset(conn, export_format, None, from_date, to_date)]

        response_data = []
        for result in results:
            response_data.append({
                "dataset": result['dataset'],
                "row_count": result['row_count'],
                "file_path": result['file_path'],
                "columns": result['columns']
            })

        return jsonify({
            "status": "success",
            "message": f"Generated {len(results)} dataset(s)",
            "datasets": response_data
        }), 200

    except Exception as e:
        logger.error(f"Error exporting dataset: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        if conn:
            conn.close()


@analytics_bp.route('/dataset_stats', methods=['GET'])
def dataset_stats():
    """
    Returns summary statistics for each available ML dataset:
    row counts from materialized views and last export info.
    """
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = get_cursor(conn, dictionary=True)

        # Get row counts from materialized views
        cursor.execute(VIEW_ROW_COUNTS_QUERY)
        view_counts = cursor.fetchall()

        # Get last export info
        cursor.execute(LAST_EXPORTS_QUERY)
        last_exports = cursor.fetchall()

        # Build response
        stats = {}
        for vc in view_counts:
            dataset = vc['dataset']
            stats[dataset] = {
                "view_row_count": vc['row_count'],
                "last_export": None
            }

        for le in last_exports:
            dataset = le['dataset_name']
            if dataset in stats:
                stats[dataset]['last_export'] = {
                    "format": le['export_format'],
                    "row_count": le['row_count'],
                    "file_path": le['file_path'],
                    "completed_at": le['completed_at'].isoformat() if le['completed_at'] else None,
                    "status": le['status']
                }

        return jsonify({
            "status": "success",
            "datasets": stats
        }), 200

    except Exception as e:
        logger.error(f"Error fetching dataset stats: {e}")
        return jsonify({"error": str(e)}), 500

    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()