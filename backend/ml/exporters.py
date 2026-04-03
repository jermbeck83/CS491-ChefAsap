"""
Export utilities for writing ML dataset query results to CSV and JSON files.
"""

import csv
import json
import os
from datetime import datetime, date
from decimal import Decimal


def json_serializer(obj):
    """Handle types that json.dumps cannot serialize by default."""
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, bool):
        return obj
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def ensure_export_dir(base_dir):
    """
    Create a timestamped export subdirectory.
    Returns the full path to the created directory.
    """
    timestamp = datetime.utcnow().strftime('%Y-%m-%d_%H%M%S')
    export_path = os.path.join(base_dir, timestamp)
    os.makedirs(export_path, exist_ok=True)
    return export_path


def export_to_csv(rows, columns, filepath):
    """
    Write a list of dicts (from RealDictCursor) to a CSV file.

    Args:
        rows: List of dicts from cursor.fetchall()
        columns: List of column name strings
        filepath: Full path to the output CSV file

    Returns:
        Number of rows written
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    with open(filepath, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()

        count = 0
        for row in rows:
            # Convert Decimal and datetime types for CSV compatibility
            clean_row = {}
            for key, value in row.items():
                if isinstance(value, Decimal):
                    clean_row[key] = float(value)
                elif isinstance(value, (datetime, date)):
                    clean_row[key] = value.isoformat()
                else:
                    clean_row[key] = value
            writer.writerow(clean_row)
            count += 1

    return count


def export_to_json(rows, filepath):
    """
    Write a list of dicts to a JSON Lines file (one JSON object per line).

    Args:
        rows: List of dicts from cursor.fetchall()
        filepath: Full path to the output JSON file

    Returns:
        Number of rows written
    """
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    count = 0
    with open(filepath, 'w', encoding='utf-8') as f:
        for row in rows:
            json_line = json.dumps(dict(row), default=json_serializer)
            f.write(json_line + '\n')
            count += 1

    return count
