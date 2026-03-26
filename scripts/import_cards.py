"""Import card data from YGOProDeck API to create passcode -> name mapping."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import requests
import urllib3

from utils.db import get_db_connection

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def main() -> None:
    print("Fetching card data from YGOProDeck...")

    # Fetch all cards (disable SSL verify due to proxy)
    resp = requests.get("https://db.ygoprodeck.com/api/v7/cardinfo.php", verify=False)
    resp.raise_for_status()
    data = resp.json()

    cards = data['data']
    print(f"Fetched {len(cards)} cards")

    # Connect to database
    conn = get_db_connection()
    cur = conn.cursor()

    # Create table if not exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            id BIGINT PRIMARY KEY,
            name TEXT NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name)")
    conn.commit()

    # Insert cards
    print("Inserting cards...")
    inserted = 0
    for card in cards:
        try:
            cur.execute(
                "INSERT INTO cards (id, name) VALUES (%s, %s) ON CONFLICT (id) DO NOTHING",
                (card['id'], card['name'])
            )
            inserted += 1
        except Exception as e:
            print(f"Error inserting {card['name']}: {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"Done! Inserted {inserted} cards")
    print()
    print("Verify with:")
    print("  SELECT COUNT(*) FROM cards;")
    print("  SELECT * FROM cards WHERE name LIKE '%Ash Blossom%';")

if __name__ == "__main__":
    main()
