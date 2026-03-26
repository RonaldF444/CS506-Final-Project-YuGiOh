package tcgplayer

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Storage represents file storage for snapshots
type Storage struct {
	outputDir string
}

func NewStorage(outputDir string) *Storage {
	// Create output directory if it doesn't exist
	os.MkdirAll(outputDir, 0755)
	return &Storage{
		outputDir: outputDir,
	}
}

// Snapshot represents a complete data snapshot
type Snapshot struct {
	Timestamp      string         `json:"timestamp"`
	CardName       string         `json:"card_name"`
	TotalPrintings int            `json:"total_printings"`
	Printings      []CardPrinting `json:"printings"`
}

// SaveSnapshot saves a complete snapshot of card data
func (s *Storage) SaveSnapshot(cardName string, printings []CardPrinting) error {
	timestamp := time.Now().Format("2006-01-02_15-04-05")

	snapshot := Snapshot{
		Timestamp:      time.Now().Format(time.RFC3339),
		CardName:       cardName,
		TotalPrintings: len(printings),
		Printings:      printings,
	}

	// Save timestamped snapshot
	filename := fmt.Sprintf("snapshot_%s_%s.json", sanitizeFilename(cardName), timestamp)
	fullPath := filepath.Join(s.outputDir, filename)

	if err := s.saveJSON(fullPath, snapshot); err != nil {
		return fmt.Errorf("failed to save snapshot: %w", err)
	}

	fmt.Printf("Saved snapshot to %s\n", fullPath)

	// Also save as "latest" for easy access
	latestPath := filepath.Join(s.outputDir, fmt.Sprintf("latest_%s.json", sanitizeFilename(cardName)))
	if err := s.saveJSON(latestPath, snapshot); err != nil {
		return fmt.Errorf("failed to save latest snapshot: %w", err)
	}

	return nil
}

// SaveAllCards saves data for multiple cards
func (s *Storage) SaveAllCards(allData map[string][]CardPrinting) error {
	timestamp := time.Now().Format("2006-01-02_15-04-05")

	type AllCardsSnapshot struct {
		Timestamp  string                    `json:"timestamp"`
		TotalCards int                       `json:"total_cards"`
		Cards      map[string][]CardPrinting `json:"cards"`
	}

	snapshot := AllCardsSnapshot{
		Timestamp:  time.Now().Format(time.RFC3339),
		TotalCards: len(allData),
		Cards:      allData,
	}

	filename := fmt.Sprintf("all_cards_%s.json", timestamp)
	fullPath := filepath.Join(s.outputDir, filename)

	if err := s.saveJSON(fullPath, snapshot); err != nil {
		return fmt.Errorf("failed to save all cards: %w", err)
	}

	fmt.Printf("Saved all cards to %s\n", fullPath)

	// Also save as latest
	latestPath := filepath.Join(s.outputDir, "latest_all.json")
	if err := s.saveJSON(latestPath, snapshot); err != nil {
		return fmt.Errorf("failed to save latest all cards: %w", err)
	}

	return nil
}

// saveJSON saves any data structure as JSON
func (s *Storage) saveJSON(path string, data interface{}) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	return encoder.Encode(data)
}

// sanitizeFilename removes characters that aren't safe for filenames
func sanitizeFilename(name string) string {
	// Replace spaces and special characters
	safe := ""
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			safe += string(r)
		} else if r == ' ' || r == '&' {
			safe += "_"
		}
	}
	return safe
}

// PrintSummary prints a summary of collected data
func PrintSummary(printings []CardPrinting) {
	if len(printings) == 0 {
		fmt.Println("No printings found")
		return
	}

	fmt.Println("\n" + strings.Repeat("=", 80))
	fmt.Printf("COLLECTED DATA FOR: %s\n", printings[0].CardName)
	fmt.Println(strings.Repeat("=", 80))

	fmt.Printf("\nTotal Printings: %d\n\n", len(printings))

	for i, p := range printings {
		fmt.Printf("%d. %s (%s)\n", i+1, p.SetCode, p.SetName)
		fmt.Printf("   Rarity: %s\n", p.Rarity)
		fmt.Printf("   Market Price: $%.2f\n", p.MarketPrice)
		fmt.Printf("   Lowest: $%.2f | Median: $%.2f | Avg Sale: $%.2f\n",
			p.LowestPrice, p.MedianPrice, p.AverageSalePrice)
		fmt.Printf("   Listings: %d | Recent Sales: %d\n\n",
			p.TotalListings, len(p.RecentSales))
	}

	// Calculate market statistics
	totalValue := 0.0
	cheapest := printings[0]
	mostExpensive := printings[0]

	for _, p := range printings {
		totalValue += p.MarketPrice
		if p.MarketPrice < cheapest.MarketPrice {
			cheapest = p
		}
		if p.MarketPrice > mostExpensive.MarketPrice {
			mostExpensive = p
		}
	}

	avgPrice := totalValue / float64(len(printings))

	fmt.Println("SUMMARY:")
	fmt.Printf("  Average Market Price: $%.2f\n", avgPrice)
	fmt.Printf("  Cheapest: %s at $%.2f\n", cheapest.SetCode, cheapest.MarketPrice)
	fmt.Printf("  Most Expensive: %s at $%.2f\n", mostExpensive.SetCode, mostExpensive.MarketPrice)

	fmt.Println(strings.Repeat("=", 80))
}
