package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type DB struct {
	conn *sql.DB
}

// Config for database connection
type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
}

// NewDB creates a new database connection
func NewDB(cfg Config) (*DB, error) {
	var connStr string
	if cfg.Password == "" {
		connStr = fmt.Sprintf(
			"postgres://%s@%s:%d/%s?sslmode=disable&search_path=public",
			cfg.User, cfg.Host, cfg.Port, cfg.DBName,
		)
	} else {
		connStr = fmt.Sprintf(
			"postgres://%s:%s@%s:%d/%s?sslmode=disable&search_path=public",
			cfg.User, cfg.Password, cfg.Host, cfg.Port, cfg.DBName,
		)
	}

	fmt.Printf("DEBUG Connection: host=%s port=%d user=%s dbname=%s\n",
		cfg.Host, cfg.Port, cfg.User, cfg.DBName)

	conn, err := sql.Open("pgx", connStr)

	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test connection
	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	conn.SetMaxOpenConns(25)
	conn.SetMaxIdleConns(5)
	conn.SetConnMaxLifetime(5 * time.Minute)

	return &DB{conn: conn}, nil
}

// Close closes the database connection
func (db *DB) Close() error {
	return db.conn.Close()
}

// Tournament represents a Yu-Gi-Oh! tournament
type Tournament struct {
	ID                       int       `db:"id" json:"id"`
	Name                     string    `db:"name" json:"name"`
	Country                  string    `db:"country" json:"country"`
	EventDate                time.Time `db:"event_date" json:"event_date"`
	Winner                   *string   `db:"winner" json:"winner"`
	Format                   string    `db:"format" json:"format"`
	Slug                     string    `db:"slug" json:"slug"`
	PlayerCount              int       `db:"player_count" json:"player_count"`
	IsApproximatePlayerCount bool      `db:"is_approximate_player_count" json:"is_approximate_player_count"`
	CreatedAt                time.Time `db:"created_at" json:"created_at"`
	UpdatedAt                time.Time `db:"updated_at" json:"updated_at"`
}

// DeckProfile represents a deck profile from a tournament
type DeckProfile struct {
	ID           int       `db:"id" json:"id"`
	TournamentID int       `db:"tournament_id" json:"tournament_id"`
	PlayerName   string    `db:"player_name" json:"player_name"`
	DeckName     *string   `db:"deck_name" json:"deck_name"`
	Placement    *int      `db:"placement" json:"placement"`
	ProfileURL   *string   `db:"profile_url" json:"profile_url"`
	MainDeck     string    `db:"main_deck" json:"main_deck"`
	ExtraDeck    string    `db:"extra_deck" json:"extra_deck"`
	SideDeck     string    `db:"side_deck" json:"side_deck"`
	CreatedAt    time.Time `db:"created_at" json:"created_at"`
	UpdatedAt    time.Time `db:"updated_at" json:"updated_at"`
}
