package database

import (
	"context"
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

	fmt.Printf("DEBUG Connection: host=%s port=%d user=%s password=%s dbname=%s\n",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName)

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

// Conn returns the underlying sql.DB connection for raw queries
func (db *DB) Conn() *sql.DB {
	return db.conn
}

// QueryRow executes a query that returns at most one row (with context)
func (db *DB) QueryRow(ctx context.Context, query string, args ...any) *sql.Row {
	return db.conn.QueryRowContext(ctx, query, args...)
}

// Query executes a query that returns rows (with context)
func (db *DB) Query(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	return db.conn.QueryContext(ctx, query, args...)
}

// Exec executes a query without returning any rows (with context)
func (db *DB) Exec(ctx context.Context, query string, args ...any) (sql.Result, error) {
	return db.conn.ExecContext(ctx, query, args...)
}

// Printing represents a card printing
type Printing struct {
	ProductID   int       `db:"product_id"`
	CardName    string    `db:"card_name"`
	SetCode     string    `db:"set_code"`
	SetName     string    `db:"set_name"`
	Rarity      string    `db:"rarity"`
	ProductLine string    `db:"product_line"`
	CreatedAt   time.Time `db:"created_at"`
}

// MarketSnapshot represents a point-in-time market state
type MarketSnapshot struct {
	Time          time.Time `db:"time"`
	ProductID     int       `db:"product_id"`
	MarketPrice   float64   `db:"market_price"`
	LowestPrice   float64   `db:"lowest_price"`
	MedianPrice   float64   `db:"median_price"`
	TotalListings int       `db:"total_listings"`
}

// Listing represents a current marketplace listing
type Listing struct {
	Time          time.Time `db:"time"`
	ProductID     int       `db:"product_id"`
	ListingID     int64     `db:"listing_id"`
	SellerName    string    `db:"seller_name"`
	Price         float64   `db:"price"`
	ShippingPrice float64   `db:"shipping_price"`
	Condition     string    `db:"condition"`
	Printing      string    `db:"printing"`
	Language      string    `db:"language"`
	Quantity      int       `db:"quantity"`
	SellerRating  float64   `db:"seller_rating"`
}

// Sale represents a completed transaction
type Sale struct {
	DetectedAt    time.Time `db:"detected_at"`
	ProductID     int       `db:"product_id"`
	OrderDate     time.Time `db:"order_date"`
	Condition     string    `db:"condition"`
	Variant       string    `db:"variant"`
	Language      string    `db:"language"`
	Quantity      int       `db:"quantity"`
	PurchasePrice float64   `db:"purchase_price"`
	ShippingPrice float64   `db:"shipping_price"`
}
