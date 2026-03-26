package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/tcgplayer"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment
	godotenv.Load()

	// Get configuration from environment
	dbHost := os.Getenv("DB_HOST")
	dbPort := 5432
	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")

	// Connect to database
	log.Printf("Connecting to database %s@%s:%d/%s...\n", dbUser, dbHost, dbPort, dbName)
	db, err := database.NewDB(database.Config{
		Host:     dbHost,
		Port:     dbPort,
		User:     dbUser,
		Password: dbPass,
		DBName:   dbName,
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Get watched product IDs
	productIDs, err := db.GetWatchedPrintings(ctx)
	if err != nil {
		log.Fatalf("Failed to get watched printings: %v", err)
	}

	log.Printf("Found %d watched products", len(productIDs))
	log.Println()
	log.Println("Fetching 6-month price history from TCGPlayer Infinite API...")
	log.Println()

	// Create TCGPlayer client
	client := tcgplayer.NewClient()

	// Stats tracking
	var (
		mu              sync.Mutex
		successCount    int
		errorCount      int
		totalSnapshots  int
		totalInserted   int
	)

	var wg sync.WaitGroup

	for i, productID := range productIDs {
		wg.Add(1)
		go func(idx int, pid int) {
			defer wg.Done()

			log.Printf("[%d/%d] Fetching price history for product %d...", idx+1, len(productIDs), pid)

			// Fetch semi-annual (6 months) of price history
			priceHistory, err := client.GetPriceHistory(pid, "semi-annual")
			if err != nil {
				mu.Lock()
				errorCount++
				mu.Unlock()
				log.Printf("  Product %d failed: %v", pid, err)
				return
			}

			if priceHistory.Count == 0 || len(priceHistory.Result) == 0 {
				log.Printf("  No price history for product %d", pid)
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

					if err := db.InsertMarketSnapshot(ctx, snapshot); err == nil {
						inserted++
					}
				}
			}

			mu.Lock()
			successCount++
			totalSnapshots += len(priceHistory.Result) * len(priceHistory.Result[0].Buckets)
			totalInserted += inserted
			mu.Unlock()

			log.Printf("  Product %d: inserted %d snapshots", pid, inserted)

		}(i, productID)

		// Small delay between starting goroutines to avoid hammering the API
		time.Sleep(100 * time.Millisecond)
	}

	wg.Wait()

	log.Println("Price history backfill complete")
	log.Printf("Products processed: %d", len(productIDs))
	log.Printf("Successful: %d, Errors: %d", successCount, errorCount)
	log.Printf("Total snapshots inserted: %d", totalInserted)
}
