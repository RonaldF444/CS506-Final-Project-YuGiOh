-- Run this SQL in your CardzTzar database to create the tournaments tables

-- Tournaments table to store tournament information
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

-- Index on event_date for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_tournaments_event_date ON tournaments(event_date);

-- Index on format for filtering by TCG/OCG/Genesys
CREATE INDEX IF NOT EXISTS idx_tournaments_format ON tournaments(format);

-- Index on country for location-based queries
CREATE INDEX IF NOT EXISTS idx_tournaments_country ON tournaments(country);

-- Deck profiles table to store tournament deck information (for future use)
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

-- Index on tournament_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_deck_profiles_tournament_id ON deck_profiles(tournament_id);

-- Index on deck_name for archetype searches
CREATE INDEX IF NOT EXISTS idx_deck_profiles_deck_name ON deck_profiles(deck_name);
