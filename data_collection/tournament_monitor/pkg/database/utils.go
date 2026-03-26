package database

import (
	"context"
	"database/sql"
)

// InsertTournament inserts or updates a tournament
func (db *DB) InsertTournament(ctx context.Context, t *Tournament) error {
	query := `
		INSERT INTO tournaments (id, name, country, event_date, winner, format, slug,
		                         player_count, is_approximate_player_count, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name,
		    country = EXCLUDED.country,
		    event_date = EXCLUDED.event_date,
		    winner = EXCLUDED.winner,
		    format = EXCLUDED.format,
		    slug = EXCLUDED.slug,
		    player_count = EXCLUDED.player_count,
		    is_approximate_player_count = EXCLUDED.is_approximate_player_count,
		    updated_at = NOW()
	`
	_, err := db.conn.ExecContext(ctx, query,
		t.ID, t.Name, t.Country, t.EventDate, t.Winner, t.Format, t.Slug,
		t.PlayerCount, t.IsApproximatePlayerCount)
	return err
}

// InsertTournaments inserts or updates tournaments in batch
func (db *DB) InsertTournaments(ctx context.Context, tournaments []Tournament) error {
	if len(tournaments) == 0 {
		return nil
	}

	tx, err := db.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO tournaments (id, name, country, event_date, winner, format, slug,
		                         player_count, is_approximate_player_count, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		ON CONFLICT (id) DO UPDATE
		SET name = EXCLUDED.name,
		    country = EXCLUDED.country,
		    event_date = EXCLUDED.event_date,
		    winner = EXCLUDED.winner,
		    format = EXCLUDED.format,
		    slug = EXCLUDED.slug,
		    player_count = EXCLUDED.player_count,
		    is_approximate_player_count = EXCLUDED.is_approximate_player_count,
		    updated_at = NOW()
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, t := range tournaments {
		_, err := stmt.ExecContext(ctx,
			t.ID, t.Name, t.Country, t.EventDate, t.Winner, t.Format, t.Slug,
			t.PlayerCount, t.IsApproximatePlayerCount)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// GetTournamentByID retrieves a tournament by ID
func (db *DB) GetTournamentByID(ctx context.Context, id int) (*Tournament, error) {
	var t Tournament
	query := `SELECT id, name, country, event_date, winner, format, slug,
	                 player_count, is_approximate_player_count, created_at, updated_at
	          FROM tournaments WHERE id = $1`
	err := db.conn.QueryRowContext(ctx, query, id).Scan(
		&t.ID, &t.Name, &t.Country, &t.EventDate, &t.Winner, &t.Format, &t.Slug,
		&t.PlayerCount, &t.IsApproximatePlayerCount, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// GetAllTournamentIDs returns all tournament IDs in the database
func (db *DB) GetAllTournamentIDs(ctx context.Context) ([]int, error) {
	query := `SELECT id FROM tournaments ORDER BY id`
	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}

	return ids, nil
}

// InsertDeckProfile inserts or updates a deck profile
func (db *DB) InsertDeckProfile(ctx context.Context, dp *DeckProfile) error {
	query := `
		INSERT INTO deck_profiles (tournament_id, player_name, deck_name, placement,
		                           profile_url, main_deck, extra_deck, side_deck, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		ON CONFLICT (tournament_id, player_name, placement) DO UPDATE
		SET deck_name = EXCLUDED.deck_name,
		    profile_url = EXCLUDED.profile_url,
		    main_deck = EXCLUDED.main_deck,
		    extra_deck = EXCLUDED.extra_deck,
		    side_deck = EXCLUDED.side_deck,
		    updated_at = NOW()
	`
	_, err := db.conn.ExecContext(ctx, query,
		dp.TournamentID, dp.PlayerName, dp.DeckName, dp.Placement,
		dp.ProfileURL, dp.MainDeck, dp.ExtraDeck, dp.SideDeck)
	return err
}

// GetDeckProfileCount returns the number of deck profiles for a tournament
func (db *DB) GetDeckProfileCount(ctx context.Context, tournamentID int) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM deck_profiles WHERE tournament_id = $1`
	err := db.conn.QueryRowContext(ctx, query, tournamentID).Scan(&count)
	return count, err
}

// Query executes a query and returns rows
func (db *DB) Query(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	return db.conn.QueryContext(ctx, query, args...)
}
