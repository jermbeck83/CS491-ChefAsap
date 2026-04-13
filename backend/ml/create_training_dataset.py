"""
ML Training Dataset Creator for ChefAsap

Extracts, transforms, and exports ML-ready datasets from the PostgreSQL
database using pre-computed materialized views.

Usage (from backend/ directory):
    python -m ml.create_training_dataset --dataset smart_matching --format csv
    python -m ml.create_training_dataset --dataset recommendations --format json
    python -m ml.create_training_dataset --dataset demand_forecast --format csv --from-date 2025-01-01
    python -m ml.create_training_dataset --all --format csv
    python -m ml.create_training_dataset --all --format csv --refresh-views
"""

import argparse
import logging
import os
import sys
from datetime import datetime

from psycopg2.extras import Json

# Add parent directory to path so database module can be imported
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_helper import get_db_connection, get_cursor
from ml.feature_queries import (
    SMART_MATCHING_DATASET_QUERY,
    RECOMMENDATION_DATASET_QUERY,
    DEMAND_FORECAST_DATASET_QUERY,
    DEMAND_FORECAST_DATASET_QUERY_ALL,
)
from ml.exporters import export_to_csv, export_to_json, ensure_export_dir

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DEFAULT_EXPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')


def refresh_ml_views(conn):
    """Refresh all ML materialized views before export."""
    logger.info("Refreshing ML materialized views...")
    conn.autocommit = True
    cursor = conn.cursor()
    try:
        views = [
            'mv_chef_inference_features',
            'mv_smart_matching_features',
            'mv_customer_preference_profile',
            'mv_demand_forecast_features',
        ]
        for view in views:
            logger.info(f"  Refreshing {view}...")
            cursor.execute(f'REFRESH MATERIALIZED VIEW CONCURRENTLY {view};')
        logger.info("All ML views refreshed.")
    finally:
        cursor.close()
        conn.autocommit = False


def log_export(conn, dataset_name, export_format, row_count, filepath, params, status, error=None):
    """Record an export to the ml_dataset_export_log table."""
    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=False)
        cursor.execute('''
            INSERT INTO ml_dataset_export_log
            (dataset_name, export_format, row_count, file_path, query_params, status, completed_at, error_message)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ''', (
            dataset_name,
            export_format,
            row_count,
            filepath,
            Json(params) if params else None,
            status,
            datetime.utcnow() if status in ('completed', 'failed') else None,
            error
        ))
        conn.commit()
    except Exception as e:
        logger.warning(f"Failed to log export: {e}")
        conn.rollback()
    finally:
        if cursor:
            cursor.close()


def generate_smart_matching_dataset(conn, export_format='csv', output_dir=None):
    """
    Generate training dataset for the Smart Matching Engine.
    Returns dict with filepath, row_count, columns.
    """
    dataset_name = 'smart_matching'
    logger.info(f"Generating {dataset_name} dataset...")

    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=True)
        cursor.execute(SMART_MATCHING_DATASET_QUERY)
        rows = cursor.fetchall()

        if not rows:
            logger.warning(f"No data found for {dataset_name} dataset.")
            log_export(conn, dataset_name, export_format, 0, None, None, 'completed')
            return {'dataset': dataset_name, 'row_count': 0, 'file_path': None, 'columns': []}

        columns = list(rows[0].keys())
        export_dir = output_dir or ensure_export_dir(DEFAULT_EXPORT_DIR)
        filepath = os.path.join(export_dir, f'{dataset_name}.{export_format}')

        if export_format == 'csv':
            row_count = export_to_csv(rows, columns, filepath)
        else:
            row_count = export_to_json(rows, filepath)

        log_export(conn, dataset_name, export_format, row_count, filepath, None, 'completed')
        logger.info(f"  Exported {row_count} rows to {filepath}")

        return {'dataset': dataset_name, 'row_count': row_count, 'file_path': filepath, 'columns': columns}

    except Exception as e:
        logger.error(f"Error generating {dataset_name} dataset: {e}")
        log_export(conn, dataset_name, export_format, 0, None, None, 'failed', str(e))
        raise
    finally:
        if cursor:
            cursor.close()


def generate_recommendation_dataset(conn, export_format='csv', output_dir=None):
    """
    Generate training dataset for Personalized Recommendations.
    Returns dict with filepath, row_count, columns.
    """
    dataset_name = 'recommendations'
    logger.info(f"Generating {dataset_name} dataset...")

    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=True)
        cursor.execute(RECOMMENDATION_DATASET_QUERY)
        rows = cursor.fetchall()

        if not rows:
            logger.warning(f"No data found for {dataset_name} dataset.")
            log_export(conn, dataset_name, export_format, 0, None, None, 'completed')
            return {'dataset': dataset_name, 'row_count': 0, 'file_path': None, 'columns': []}

        columns = list(rows[0].keys())
        export_dir = output_dir or ensure_export_dir(DEFAULT_EXPORT_DIR)
        filepath = os.path.join(export_dir, f'{dataset_name}.{export_format}')

        if export_format == 'csv':
            row_count = export_to_csv(rows, columns, filepath)
        else:
            row_count = export_to_json(rows, filepath)

        log_export(conn, dataset_name, export_format, row_count, filepath, None, 'completed')
        logger.info(f"  Exported {row_count} rows to {filepath}")

        return {'dataset': dataset_name, 'row_count': row_count, 'file_path': filepath, 'columns': columns}

    except Exception as e:
        logger.error(f"Error generating {dataset_name} dataset: {e}")
        log_export(conn, dataset_name, export_format, 0, None, None, 'failed', str(e))
        raise
    finally:
        if cursor:
            cursor.close()


def generate_demand_forecast_dataset(conn, export_format='csv', output_dir=None, from_date=None, to_date=None):
    """
    Generate training dataset for Demand Forecasting.
    Optionally filter by date range.
    Returns dict with filepath, row_count, columns.
    """
    dataset_name = 'demand_forecast'
    logger.info(f"Generating {dataset_name} dataset...")

    params = {}
    if from_date:
        params['from_date'] = from_date
    if to_date:
        params['to_date'] = to_date

    cursor = None
    try:
        cursor = get_cursor(conn, dictionary=True)

        if from_date or to_date:
            cursor.execute(DEMAND_FORECAST_DATASET_QUERY, {
                'from_date': from_date,
                'to_date': to_date
            })
        else:
            cursor.execute(DEMAND_FORECAST_DATASET_QUERY_ALL)

        rows = cursor.fetchall()

        if not rows:
            logger.warning(f"No data found for {dataset_name} dataset.")
            log_export(conn, dataset_name, export_format, 0, None, params or None, 'completed')
            return {'dataset': dataset_name, 'row_count': 0, 'file_path': None, 'columns': []}

        columns = list(rows[0].keys())
        export_dir = output_dir or ensure_export_dir(DEFAULT_EXPORT_DIR)
        filepath = os.path.join(export_dir, f'{dataset_name}.{export_format}')

        if export_format == 'csv':
            row_count = export_to_csv(rows, columns, filepath)
        else:
            row_count = export_to_json(rows, filepath)

        log_export(conn, dataset_name, export_format, row_count, filepath, params or None, 'completed')
        logger.info(f"  Exported {row_count} rows to {filepath}")

        return {'dataset': dataset_name, 'row_count': row_count, 'file_path': filepath, 'columns': columns}

    except Exception as e:
        logger.error(f"Error generating {dataset_name} dataset: {e}")
        log_export(conn, dataset_name, export_format, 0, None, params or None, 'failed', str(e))
        raise
    finally:
        if cursor:
            cursor.close()


def generate_all_datasets(conn, export_format='csv', output_dir=None, from_date=None, to_date=None):
    """Generate all three training datasets. Returns list of result dicts."""
    export_dir = output_dir or ensure_export_dir(DEFAULT_EXPORT_DIR)
    results = []

    results.append(generate_smart_matching_dataset(conn, export_format, export_dir))
    results.append(generate_recommendation_dataset(conn, export_format, export_dir))
    results.append(generate_demand_forecast_dataset(conn, export_format, export_dir, from_date, to_date))

    return results


def main():
    parser = argparse.ArgumentParser(
        description='Generate ML training datasets for ChefAsap AI models'
    )
    parser.add_argument(
        '--dataset',
        choices=['smart_matching', 'recommendations', 'demand_forecast', 'all'],
        default='all',
        help='Which dataset to generate (default: all)'
    )
    parser.add_argument(
        '--all',
        action='store_true',
        dest='all_datasets',
        help='Shorthand for --dataset all'
    )
    parser.add_argument(
        '--format',
        choices=['csv', 'json'],
        default='csv',
        help='Export format (default: csv)'
    )
    parser.add_argument(
        '--from-date',
        type=str,
        default=None,
        help='Start date filter YYYY-MM-DD (demand_forecast only)'
    )
    parser.add_argument(
        '--to-date',
        type=str,
        default=None,
        help='End date filter YYYY-MM-DD (demand_forecast only)'
    )
    parser.add_argument(
        '--refresh-views',
        action='store_true',
        help='Refresh materialized views before exporting'
    )
    parser.add_argument(
        '--output-dir',
        type=str,
        default=None,
        help='Custom output directory (default: ml/exports/<timestamp>)'
    )

    args = parser.parse_args()

    conn = None
    try:
        conn = get_db_connection()

        if args.refresh_views:
            refresh_ml_views(conn)
            # Re-establish connection after autocommit change
            conn.close()
            conn = get_db_connection()

        export_dir = args.output_dir
        dataset = 'all' if args.all_datasets else args.dataset

        if dataset == 'all':
            results = generate_all_datasets(conn, args.format, export_dir, args.from_date, args.to_date)
        elif dataset == 'smart_matching':
            results = [generate_smart_matching_dataset(conn, args.format, export_dir)]
        elif dataset == 'recommendations':
            results = [generate_recommendation_dataset(conn, args.format, export_dir)]
        elif dataset == 'demand_forecast':
            results = [generate_demand_forecast_dataset(conn, args.format, export_dir, args.from_date, args.to_date)]

        print("\n" + "=" * 70)
        print("Dataset Export Summary")
        print("=" * 70)
        total_rows = 0
        for result in results:
            status = "OK" if result['row_count'] > 0 else "EMPTY"
            print(f"  [{status}] {result['dataset']}: {result['row_count']} rows -> {result['file_path']}")
            total_rows += result['row_count']
        print(f"\nTotal: {total_rows} rows across {len(results)} datasets")
        print("=" * 70)

    except Exception as e:
        logger.error(f"Dataset generation failed: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()


if __name__ == '__main__':
    main()
