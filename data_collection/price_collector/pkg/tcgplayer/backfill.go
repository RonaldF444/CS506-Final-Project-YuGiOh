package tcgplayer

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
)

// Rate limiting configuration
const (
	maxConcurrentRequests  = 2                        // Reduced from 5 to avoid rate limiting
	delayBetweenGoroutines = 1500 * time.Millisecond  // Increased from 100ms
	maxRetries             = 3
	baseRetryDelay         = 30 * time.Second         // Exponential backoff: 30s, 60s, 120s
)

// PriceBackfillStats tracks price history backfill progress
type PriceBackfillStats struct {
	ProductsProcessed int
	SuccessCount      int
	ErrorCount        int
	TotalSnapshots    int
	TotalInserted     int
	mu                sync.Mutex
}

// NewBackfiller creates a new backfiller
func NewBackfiller(db *database.DB) *Backfiller {
	return &Backfiller{
		db:     db,
		client: NewClient(),
	}
}

// fetchWithRetry executes a fetch function with exponential backoff on rate limit errors
func (b *Backfiller) fetchWithRetry(productID int, fetchFunc func() error) error {
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		err := fetchFunc()
		if err == nil {
			return nil
		}

		// Check if rate limited (403 error)
		errStr := err.Error()
		if strings.Contains(errStr, "403") || strings.Contains(errStr, "rate") {
			delay := baseRetryDelay * time.Duration(1<<attempt) // 30s, 60s, 120s
			log.Printf("  [RATE LIMITED] Product %d, waiting %v before retry %d/%d",
				productID, delay, attempt+1, maxRetries)
			time.Sleep(delay)
			lastErr = err
			continue
		}

		// Non-rate-limit error, don't retry
		return err
	}
	return fmt.Errorf("max retries exceeded for product %d: %w", productID, lastErr)
}

// =============================================================================
// BACKFILL ALL WATCHED CARDS (for CLI commands)
// =============================================================================

// RunAll backfills both sales and price history for all watched printings
func (b *Backfiller) RunAll(ctx context.Context) error {
	log.Println("=== Starting full backfill (sales + price history) ===")
	log.Println()

	// Run sales backfill
	salesStats, err := b.RunSales(ctx)
	if err != nil {
		return err
	}
	salesStats.PrintSummary()

	// Run price history backfill
	priceStats, err := b.RunPriceHistory(ctx)
	if err != nil {
		return err
	}
	priceStats.PrintSummary()

	log.Println("=== Full backfill complete ===")
	return nil
}

// RunSales backfills sales for all watched printings
func (b *Backfiller) RunSales(ctx context.Context) (*BackfillStats, error) {
	productIDs, err := b.db.GetWatchedPrintings(ctx)
	if err != nil {
		return nil, err
	}
	return b.RunSalesForProducts(ctx, productIDs)
}

// Run is an alias for RunSales (backward compatibility)
func (b *Backfiller) Run(ctx context.Context) (*BackfillStats, error) {
	return b.RunSales(ctx)
}

// RunPriceHistory backfills price history for all watched printings
func (b *Backfiller) RunPriceHistory(ctx context.Context) (*PriceBackfillStats, error) {
	productIDs, err := b.db.GetWatchedPrintings(ctx)
	if err != nil {
		return nil, err
	}
	return b.RunPriceHistoryForProducts(ctx, productIDs)
}

// =============================================================================
// BACKFILL SPECIFIC PRODUCTS (for Backend's new card discovery)
// =============================================================================

// RunAllForProducts backfills both sales and price history for specific product IDs
func (b *Backfiller) RunAllForProducts(ctx context.Context, productIDs []int) error {
	if len(productIDs) == 0 {
		return nil
	}

	log.Printf("=== Starting backfill for %d products (sales + price history) ===", len(productIDs))
	log.Println()

	// Run sales backfill
	salesStats, err := b.RunSalesForProducts(ctx, productIDs)
	if err != nil {
		return err
	}
	salesStats.PrintSummary()

	// Run price history backfill
	priceStats, err := b.RunPriceHistoryForProducts(ctx, productIDs)
	if err != nil {
		return err
	}
	priceStats.PrintSummary()

	log.Printf("=== Backfill complete for %d products ===", len(productIDs))
	return nil
}

// RunSalesForProducts backfills sales for specific product IDs
func (b *Backfiller) RunSalesForProducts(ctx context.Context, productIDs []int) (*BackfillStats, error) {
	if len(productIDs) == 0 {
		return &BackfillStats{}, nil
	}

	log.Printf("Backfilling sales for %d products (concurrency: %d, delay: %v)...\n",
		len(productIDs), maxConcurrentRequests, delayBetweenGoroutines)
	log.Println()

	stats := &BackfillStats{}
	var wg sync.WaitGroup

	// Semaphore to limit concurrent requests (reduced to avoid rate limiting)
	sem := make(chan struct{}, maxConcurrentRequests)

	for i, productID := range productIDs {
		wg.Add(1)
		go func(idx int, pid int) {
			defer wg.Done()

			// Acquire semaphore
			sem <- struct{}{}
			defer func() { <-sem }()

			log.Printf("[%d/%d] Fetching sales for product %d...", idx+1, len(productIDs), pid)

			var sales []Sale
			err := b.fetchWithRetry(pid, func() error {
				var fetchErr error
				sales, fetchErr = b.client.GetAllSales(pid)
				return fetchErr
			})

			if err != nil {
				stats.mu.Lock()
				stats.ErrorCount++
				stats.mu.Unlock()
				log.Printf("  Product %d failed after retries: %v", pid, err)
				return
			}

			if len(sales) == 0 {
				stats.mu.Lock()
				stats.NoSalesCount++
				stats.mu.Unlock()
				log.Printf("  No sales found for product %d", pid)
				return
			}

			log.Printf("  Found %d sales for product %d", len(sales), pid)

			// Convert to database format
			dbSales := make([]database.Sale, len(sales))
			for j, sale := range sales {
				dbSales[j] = database.Sale{
					DetectedAt:    time.Now(),
					ProductID:     pid,
					OrderDate:     sale.OrderDate,
					Condition:     sale.Condition,
					Variant:       sale.Variant,
					Language:      sale.Language,
					Quantity:      sale.Quantity,
					PurchasePrice: sale.PurchasePrice,
					ShippingPrice: sale.ShippingPrice,
				}
			}

			// Insert into database
			if err := b.db.InsertSales(ctx, dbSales); err != nil {
				stats.mu.Lock()
				stats.ErrorCount++
				stats.mu.Unlock()
				log.Printf("  Failed to insert product %d: %v", pid, err)
				return
			}

			stats.mu.Lock()
			stats.SuccessCount++
			stats.TotalSales += len(sales)
			stats.TotalInserted += len(sales)
			stats.mu.Unlock()

		}(i, productID)

		// Increased delay between starting goroutines to avoid rate limiting
		time.Sleep(delayBetweenGoroutines)
	}

	wg.Wait()

	stats.ProductsProcessed = len(productIDs)
	return stats, nil
}

// RunPriceHistoryForProducts backfills price history for specific product IDs
func (b *Backfiller) RunPriceHistoryForProducts(ctx context.Context, productIDs []int) (*PriceBackfillStats, error) {
	if len(productIDs) == 0 {
		return &PriceBackfillStats{}, nil
	}

	log.Printf("Backfilling price history for %d products (concurrency: %d, delay: %v)...\n",
		len(productIDs), maxConcurrentRequests, delayBetweenGoroutines)
	log.Println()

	stats := &PriceBackfillStats{}
	var wg sync.WaitGroup

	// Semaphore to limit concurrent requests (added to match sales backfill)
	sem := make(chan struct{}, maxConcurrentRequests)

	for i, productID := range productIDs {
		wg.Add(1)
		go func(idx int, pid int) {
			defer wg.Done()

			// Acquire semaphore
			sem <- struct{}{}
			defer func() { <-sem }()

			log.Printf("[%d/%d] Fetching price history for product %d...", idx+1, len(productIDs), pid)

			var priceHistory *PriceHistoryResponse
			err := b.fetchWithRetry(pid, func() error {
				var fetchErr error
				priceHistory, fetchErr = b.client.GetPriceHistory(pid, "semi-annual")
				return fetchErr
			})

			if err != nil {
				stats.mu.Lock()
				stats.ErrorCount++
				stats.mu.Unlock()
				log.Printf("  Product %d failed after retries: %v", pid, err)
				return
			}

			if priceHistory.Count == 0 || len(priceHistory.Result) == 0 {
				log.Printf("  No price history for product %d", pid)
				stats.mu.Lock()
				stats.SuccessCount++
				stats.mu.Unlock()
				return
			}

			// Process each SKU (condition/variant combination)
			inserted := 0
			for _, sku := range priceHistory.Result {
				for _, bucket := range sku.Buckets {
					// Parse bucket date (API returns "2006-01-02" format)
					// Convert to 12:00 noon UTC to match import_tcgcsv format
					bucketDate, err := time.Parse("2006-01-02", bucket.BucketStartDate)
					if err != nil {
						continue
					}
					bucketTime := time.Date(bucketDate.Year(), bucketDate.Month(), bucketDate.Day(), 12, 0, 0, 0, time.UTC)

					// Parse market price
					marketPrice, _ := strconv.ParseFloat(bucket.MarketPrice, 64)
					lowPrice, _ := strconv.ParseFloat(bucket.LowSalePrice, 64)
					highPrice, _ := strconv.ParseFloat(bucket.HighSalePrice, 64)

					// Use median as average of low and high
					medianPrice := (lowPrice + highPrice) / 2
					if lowPrice == 0 && highPrice == 0 {
						medianPrice = marketPrice
					}

					// Only insert if we have a market price
					if marketPrice == 0 {
						continue
					}

					// Create snapshot
					snapshot := &database.MarketSnapshot{
						Time:          bucketTime,
						ProductID:     pid,
						MarketPrice:   marketPrice,
						LowestPrice:   lowPrice,
						MedianPrice:   medianPrice,
						TotalListings: 0, // Not available from this API
					}

					if err := b.db.InsertMarketSnapshot(ctx, snapshot); err == nil {
						inserted++
					}
				}
			}

			stats.mu.Lock()
			stats.SuccessCount++
			stats.TotalInserted += inserted
			stats.mu.Unlock()

			log.Printf("  Product %d: inserted %d snapshots", pid, inserted)

		}(i, productID)

		// Increased delay between starting goroutines to avoid rate limiting
		time.Sleep(delayBetweenGoroutines)
	}

	wg.Wait()

	stats.ProductsProcessed = len(productIDs)
	return stats, nil
}

// =============================================================================
// SUMMARY FUNCTIONS
// =============================================================================

// PrintSummary prints the sales backfill summary
func (s *BackfillStats) PrintSummary() {
	log.Println()
	log.Println("Sales backfill complete!")
	log.Printf("  Products processed: %d", s.ProductsProcessed)
	log.Printf("  Successful: %d | Errors: %d | No sales: %d", s.SuccessCount, s.ErrorCount, s.NoSalesCount)
	log.Printf("  Total sales collected: %d", s.TotalSales)
	log.Printf("  Total sales inserted: %d", s.TotalInserted)
}

// PrintSummary prints the price history backfill summary
func (s *PriceBackfillStats) PrintSummary() {
	log.Println()
	log.Println("Price history backfill complete!")
	log.Printf("  Products processed: %d", s.ProductsProcessed)
	log.Printf("  Successful: %d | Errors: %d", s.SuccessCount, s.ErrorCount)
	log.Printf("  Total snapshots inserted: %d", s.TotalInserted)
}
