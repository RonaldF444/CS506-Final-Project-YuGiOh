"""Database connection utilities with retry logic and keepalive settings."""
from __future__ import annotations

import time

import psycopg2
import psycopg2.extensions

from config import DB_CONFIG


def get_db_connection() -> psycopg2.extensions.connection:
    """Create a database connection with timeout and keepalive settings."""
    db_config_with_timeout = DB_CONFIG.copy()
    db_config_with_timeout['connect_timeout'] = 30
    db_config_with_timeout['keepalives'] = 1
    db_config_with_timeout['keepalives_idle'] = 30
    db_config_with_timeout['keepalives_interval'] = 10
    db_config_with_timeout['keepalives_count'] = 5

    max_retries = 3
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            print(f"Connecting to database (attempt {attempt + 1}/{max_retries})...")
            conn = psycopg2.connect(**db_config_with_timeout)
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = '1800000'")
                conn.commit()
            return conn
        except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
            if attempt < max_retries - 1:
                print(f"Connection error: {e}")
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                print(f"Failed to connect after {max_retries} attempts")
                raise
