package main

import (
	"context"
	"log"
	"os"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/tcgplayer"
	"github.com/joho/godotenv"
)

func main() {
	godotenv.Load()

	dbHost := os.Getenv("DB_HOST")
	dbPort := 5432
	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")
	cardName := os.Getenv("CARD_NAME")

	log.Printf("Searching for: %s\n", cardName)

	// Connect to database
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

	client := tcgplayer.NewClient()
	ctx := context.Background()

	products, err := client.SearchCards(cardName)
	if err != nil {
		log.Fatalf("Failed to search: %v", err)
	}

	log.Printf(" Found %d printings\n\n", len(products))

	// Add each printing to watch list
	added := 0
	for _, product := range products {
		// Insert printing info
		printing := &database.Printing{
			ProductID:   int(product.ProductID),
			CardName:    product.ProductName,
			SetCode:     product.CustomAttributes.Number,
			SetName:     product.SetName,
			Rarity:      product.RarityName,
			ProductLine: "yugioh",
		}

		if err := db.InsertPrinting(ctx, printing); err != nil {
			log.Printf("  Failed to insert printing %d: %v\n", int(product.ProductID), err)
			continue
		}

		// Add to watch list
		if err := db.AddWatchedPrinting(ctx, int(product.ProductID), product.ProductName, product.CustomAttributes.Number); err != nil {
			log.Printf("  Failed to add to watch list %d: %v\n", int(product.ProductID), err)
			continue
		}

		log.Printf("Added: %s (%s) - Product ID: %d\n",
			product.CustomAttributes.Number, product.SetName, int(product.ProductID))
		added++
	}

	log.Printf("\nSuccessfully added %d/%d printings to watch list!\n", added, len(products))
}
