package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
	"github.com/joho/godotenv"
)

// TCGCSVPrice represents a price entry from TCGCSV
type TCGCSVPrice struct {
	ProductID      int      `json:"productId"`
	LowPrice       *float64 `json:"lowPrice"`
	MidPrice       *float64 `json:"midPrice"`
	HighPrice      *float64 `json:"highPrice"`
	MarketPrice    *float64 `json:"marketPrice"`
	DirectLowPrice *float64 `json:"directLowPrice"`
	SubTypeName    string   `json:"subTypeName"`
}

// TCGCSVResponse represents the prices file structure
type TCGCSVResponse struct {
	Success bool          `json:"success"`
	Errors  []interface{} `json:"errors"`
	Results []TCGCSVPrice `json:"results"`
}

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
	watchedIDs, err := db.GetWatchedPrintings(ctx)
	if err != nil {
		log.Fatalf("Failed to get watched printings: %v", err)
	}

	// Build a set for fast lookup
	watchedSet := make(map[int]bool)
	for _, id := range watchedIDs {
		watchedSet[id] = true
	}

	log.Printf("Found %d watched products", len(watchedIDs))

	// Create temp directory for downloads
	tempDir := filepath.Join(os.TempDir(), "tcgcsv_import")
	os.MkdirAll(tempDir, 0755)
	defer os.RemoveAll(tempDir) // Clean up when done

	// Calculate date range: Feb 8, 2024 to yesterday
	startDate := time.Date(2024, 2, 8, 0, 0, 0, 0, time.UTC)
	endDate := time.Now().AddDate(0, 0, -1) // Yesterday

	totalInserted := 0
	totalDays := 0
	failedDays := 0

	log.Printf("Importing data from %s to %s", startDate.Format("2006-01-02"), endDate.Format("2006-01-02"))
	log.Println()

	// Process each day
	for date := startDate; !date.After(endDate); date = date.AddDate(0, 0, 1) {
		dateStr := date.Format("2006-01-02")

		// Download archive
		archiveURL := fmt.Sprintf("https://tcgcsv.com/archive/tcgplayer/prices-%s.ppmd.7z", dateStr)
		archivePath := filepath.Join(tempDir, fmt.Sprintf("prices-%s.ppmd.7z", dateStr))
		extractPath := tempDir // 7z extracts contents directly here

		// Download
		log.Printf("[%s] Downloading...", dateStr)
		err := downloadFile(archiveURL, archivePath)
		if err != nil {
			log.Printf("[%s] Failed to download: %v", dateStr, err)
			failedDays++
			continue
		}

		// Extract with 7zip
		log.Printf("[%s] Extracting...", dateStr)
		err = extract7z(archivePath, tempDir)
		if err != nil {
			log.Printf("[%s] Failed to extract: %v", dateStr, err)
			os.Remove(archivePath)
			failedDays++
			continue
		}

		// Process the extracted data
		inserted := processArchive(ctx, db, extractPath, dateStr, watchedSet)
		totalInserted += inserted
		totalDays++

		log.Printf("[%s] Inserted %d snapshots", dateStr, inserted)

		// Clean up this day's files to save disk space
		os.Remove(archivePath)
		os.RemoveAll(filepath.Join(tempDir, dateStr)) // Remove the date folder
	}

	log.Println("Import complete")
	log.Printf("Days processed: %d", totalDays)
	log.Printf("Days failed: %d", failedDays)
	log.Printf("Total snapshots inserted: %d", totalInserted)
}

func downloadFile(url, filepath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	return err
}

func extract7z(archivePath, destDir string) error {
	// Try 7z command (Linux/Mac) or 7z.exe (Windows)
	cmd := exec.Command("7z", "x", archivePath, "-o"+destDir, "-y")
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Try with full path on Windows
		cmd = exec.Command("C:\\Program Files\\7-Zip\\7z.exe", "x", archivePath, "-o"+destDir, "-y")
		output, err = cmd.CombinedOutput()
		if err != nil {
			return fmt.Errorf("%v: %s", err, string(output))
		}
	}
	return nil
}

func processArchive(ctx context.Context, db *database.DB, archivePath, dateStr string, watchedSet map[int]bool) int {
	inserted := 0
	filesFound := 0
	productsScanned := 0

	// Parse date for snapshot time (12:00 noon UTC)
	date, _ := time.Parse("2006-01-02", dateStr)
	snapshotTime := time.Date(date.Year(), date.Month(), date.Day(), 12, 0, 0, 0, time.UTC)

	// Walk through the archive - Yu-Gi-Oh is category 2
	// Archive extracts as: tempDir/2024-02-08/2/...
	yugiohPath := filepath.Join(archivePath, dateStr, "2")

	// Debug: check if path exists
	if _, err := os.Stat(yugiohPath); os.IsNotExist(err) {
		log.Printf("  DEBUG: Path does not exist: %s", yugiohPath)
	}

	filepath.Walk(yugiohPath, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || info.Name() != "prices" {
			return nil
		}

		filesFound++

		// Read and parse prices file
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		var response TCGCSVResponse
		if err := json.Unmarshal(data, &response); err != nil {
			return nil
		}

		// Process each price entry
		for _, price := range response.Results {
			productsScanned++

			// Only process watched products
			if !watchedSet[price.ProductID] {
				continue
			}

			// Get values (handle nil pointers)
			marketPrice := 0.0
			if price.MarketPrice != nil {
				marketPrice = *price.MarketPrice
			}

			lowPrice := 0.0
			if price.LowPrice != nil {
				lowPrice = *price.LowPrice
			}

			midPrice := 0.0
			if price.MidPrice != nil {
				midPrice = *price.MidPrice
			}

			// Insert market snapshot
			snapshot := &database.MarketSnapshot{
				Time:          snapshotTime,
				ProductID:     price.ProductID,
				MarketPrice:   marketPrice,
				LowestPrice:   lowPrice,
				MedianPrice:   midPrice,
				TotalListings: 0,
			}

			if err := db.InsertMarketSnapshot(ctx, snapshot); err == nil {
				inserted++
			}
		}

		return nil
	})

	if filesFound == 0 {
		log.Printf("  DEBUG: No price files found in %s", yugiohPath)
	} else if inserted == 0 {
		log.Printf("  DEBUG: Scanned %d files, %d products, but no watched products matched", filesFound, productsScanned)
	}

	return inserted
}
