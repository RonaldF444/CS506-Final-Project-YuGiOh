#!/bin/bash
set -e

DATADIR="/docker-entrypoint-initdb.d/data"

echo "Loading tournament data..."

# Decompress gzipped files to /tmp
cd "$DATADIR"
for f in *.gz; do
    [ -f "$f" ] && gzip -dc "$f" > "/tmp/$(basename "$f" .gz)"
done
# Copy uncompressed CSVs to /tmp too
for f in *.csv; do
    [ -f "$f" ] && cp "$f" "/tmp/$f"
done
DATADIR="/tmp"

# Load small tables first
echo "Loading cards..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\COPY cards(id, name) FROM '$DATADIR/cards.csv' CSV HEADER"

echo "Loading tournaments..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\COPY tournaments(id, name, country, event_date, winner, format, slug, player_count, is_approximate_player_count) FROM '$DATADIR/tournaments.csv' CSV HEADER"

echo "Loading printings..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\COPY printings(card_name, product_id, set_code, set_name, rarity, product_line) FROM '$DATADIR/printings.csv' CSV HEADER"

echo "Loading deck_profiles..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\COPY deck_profiles(id, tournament_id, player_name, deck_name, placement, profile_url, main_deck, extra_deck, side_deck) FROM '$DATADIR/deck_profiles.csv' CSV HEADER"

# Reset deck_profiles sequence
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT setval('deck_profiles_id_seq', (SELECT MAX(id) FROM deck_profiles));"

echo "Loading market_snapshots (this may take a minute)..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\COPY market_snapshots(product_id, time, market_price, lowest_price, median_price, total_listings) FROM '$DATADIR/market_snapshots.csv' CSV HEADER"

# Clean up decompressed files
rm -f "$DATADIR"/*.csv.orig 2>/dev/null || true

echo "Data loading complete!"
echo "  tournaments: $(psql -t --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM tournaments")"
echo "  deck_profiles: $(psql -t --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM deck_profiles")"
echo "  cards: $(psql -t --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM cards")"
echo "  printings: $(psql -t --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM printings")"
echo "  market_snapshots: $(psql -t --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT COUNT(*) FROM market_snapshots")"
