"""
Database configuration for ChefAsap backend
PostgreSQL (Render Cloud)
"""

import os

# PostgreSQL configuration (Render Cloud)
db_config = {
    'host': os.getenv('RENDER_DB_HOST', 'dpg-d6muqvngi27c73c4ilq0-a.oregon-postgres.render.com'),
    'port': int(os.getenv('RENDER_DB_PORT', '5432')),
    'user': os.getenv('RENDER_DB_USER', 'chefasap_db_user'),
    'password': os.getenv('RENDER_DB_PASSWORD', 't2px3lrdYt7rbmrmPTN2zKayGAResK8i'),
    'database': os.getenv('RENDER_DB_NAME', 'chefasap_db')
}

# SSL mode for Render (use connection string instead)
connection_string = f"postgresql://{db_config['user']}:{db_config['password']}@{db_config['host']}:{db_config['port']}/{db_config['database']}?sslmode=require"
