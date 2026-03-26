-- Schema for cardtzar database

CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT,
    event_date DATE NOT NULL,
    winner TEXT,
    format TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    player_count INTEGER,
    is_approximate_player_count BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tournaments_event_date ON tournaments(event_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_format ON tournaments(format);

CREATE TABLE IF NOT EXISTS deck_profiles (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournaments(id),
    player_name TEXT NOT NULL,
    deck_name TEXT,
    placement INTEGER,
    profile_url TEXT,
    main_deck JSONB,
    extra_deck JSONB,
    side_deck JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_name, placement)
);
CREATE INDEX IF NOT EXISTS idx_deck_profiles_tournament_id ON deck_profiles(tournament_id);

CREATE TABLE IF NOT EXISTS cards (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);

CREATE TABLE IF NOT EXISTS printings (
    id SERIAL PRIMARY KEY,
    card_name TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    set_code TEXT,
    set_name TEXT,
    rarity TEXT,
    product_line TEXT
);
CREATE INDEX IF NOT EXISTS idx_printings_card_name ON printings(card_name);
CREATE INDEX IF NOT EXISTS idx_printings_product_id ON printings(product_id);

CREATE TABLE IF NOT EXISTS market_snapshots (
    id SERIAL PRIMARY KEY,
    time TIMESTAMP WITH TIME ZONE NOT NULL,
    product_id INTEGER NOT NULL,
    market_price NUMERIC,
    lowest_price NUMERIC,
    median_price NUMERIC,
    total_listings INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ms_product_id ON market_snapshots(product_id);
CREATE INDEX IF NOT EXISTS idx_ms_time ON market_snapshots(time);
CREATE INDEX IF NOT EXISTS idx_ms_product_time ON market_snapshots(product_id, time);

