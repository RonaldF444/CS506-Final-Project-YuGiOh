package database

import (
	"context"
	"time"
)

// InsertPrinting inserts or updates a printing
func (db *DB) InsertPrinting(ctx context.Context, p *Printing) error {
	query := `
		INSERT INTO printings (product_id, card_name, set_code, set_name, rarity, product_line)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (product_id) DO UPDATE
		SET card_name = EXCLUDED.card_name,
		    set_code = EXCLUDED.set_code,
		    set_name = EXCLUDED.set_name,
		    rarity = EXCLUDED.rarity
	`
	_, err := db.conn.ExecContext(ctx, query,
		p.ProductID, p.CardName, p.SetCode, p.SetName, p.Rarity, p.ProductLine)
	return err
}

// InsertMarketSnapshot inserts a market snapshot
func (db *DB) InsertMarketSnapshot(ctx context.Context, s *MarketSnapshot) error {
	query := `
		INSERT INTO market_snapshots (time, product_id, market_price, lowest_price, median_price, total_listings)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (time, product_id) DO UPDATE
		SET market_price = EXCLUDED.market_price,
		    lowest_price = EXCLUDED.lowest_price,
		    median_price = EXCLUDED.median_price,
		    total_listings = EXCLUDED.total_listings
	`
	_, err := db.conn.ExecContext(ctx, query,
		s.Time, s.ProductID, s.MarketPrice, s.LowestPrice, s.MedianPrice, s.TotalListings)
	return err
}

// InsertListings inserts current listings (batch)
func (db *DB) InsertListings(ctx context.Context, listings []Listing) error {
	if len(listings) == 0 {
		return nil
	}

	tx, err := db.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO listings (time, product_id, listing_id, seller_name, price, shipping_price, 
		                      condition, printing, language, quantity, seller_rating)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (time, product_id, listing_id) DO NOTHING
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, l := range listings {
		_, err := stmt.ExecContext(ctx,
			l.Time, l.ProductID, l.ListingID, l.SellerName, l.Price, l.ShippingPrice,
			l.Condition, l.Printing, l.Language, l.Quantity, l.SellerRating)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// InsertSales inserts sales (batch, only new ones)
func (db *DB) InsertSales(ctx context.Context, sales []Sale) error {
	if len(sales) == 0 {
		return nil
	}

	tx, err := db.conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO sales (product_id, order_date, condition, variant, language, 
		                   quantity, purchase_price, shipping_price)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (product_id, order_date, purchase_price) DO NOTHING
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	inserted := 0
	for _, s := range sales {
		result, err := stmt.ExecContext(ctx,
			s.ProductID, s.OrderDate, s.Condition, s.Variant, s.Language,
			s.Quantity, s.PurchasePrice, s.ShippingPrice)
		if err != nil {
			return err
		}
		rows, _ := result.RowsAffected()
		inserted += int(rows)
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	return nil
}

// GetWatchedPrintings returns all active watched printings
func (db *DB) GetWatchedPrintings(ctx context.Context) ([]int, error) {
	query := `SELECT product_id FROM watched_printings WHERE is_active = true`
	rows, err := db.conn.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var productIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		productIDs = append(productIDs, id)
	}

	return productIDs, nil
}

// AddWatchedPrinting adds a printing to watch list
func (db *DB) AddWatchedPrinting(ctx context.Context, productID int, cardName, setCode string) error {
	query := `
		INSERT INTO watched_printings (product_id, card_name, set_code)
		VALUES ($1, $2, $3)
		ON CONFLICT (product_id) DO UPDATE
		SET is_active = true
	`
	_, err := db.conn.ExecContext(ctx, query, productID, cardName, setCode)
	return err
}

// GetLatestSaleTimestamp gets the most recent sale timestamp for a printing
func (db *DB) GetLatestSaleTimestamp(ctx context.Context, productID int) (time.Time, error) {
	var t time.Time
	query := `SELECT COALESCE(MAX(order_date), '1970-01-01'::timestamptz) FROM sales WHERE product_id = $1`
	err := db.conn.QueryRowContext(ctx, query, productID).Scan(&t)
	return t, err
}

// GetWatchedPrintingInfo returns card info for a watched printing
func (db *DB) GetWatchedPrintingInfo(ctx context.Context, productID int) (cardName, setCode string, err error) {
	query := `SELECT card_name, set_code FROM watched_printings WHERE product_id = $1 AND is_active = true`
	err = db.conn.QueryRowContext(ctx, query, productID).Scan(&cardName, &setCode)
	if err != nil {
		// Fallback to printings table
		query = `SELECT card_name, set_code FROM printings WHERE product_id = $1`
		err = db.conn.QueryRowContext(ctx, query, productID).Scan(&cardName, &setCode)
	}
	return
}

// GetProductIDBySetCode returns the product_id for a given set code
func (db *DB) GetProductIDBySetCode(ctx context.Context, setCode string) (int, error) {
	var productID int
	query := `SELECT product_id FROM watched_printings WHERE set_code = $1 AND is_active = true LIMIT 1`
	err := db.conn.QueryRowContext(ctx, query, setCode).Scan(&productID)
	if err != nil {
		// Fallback to printings table
		query = `SELECT product_id FROM printings WHERE set_code = $1 LIMIT 1`
		err = db.conn.QueryRowContext(ctx, query, setCode).Scan(&productID)
	}
	return productID, err
}
