package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/CardzTsar/Tournamet-results-monitor/pkg/database"
	"github.com/CardzTsar/Tournamet-results-monitor/pkg/ygoprodeck"

	"github.com/joho/godotenv"
)

type backfillTournament struct {
	ID        int
	Slug      string
	EventDate time.Time
	Name      string
}

func main() {
	startMonth := flag.String("start", "", "Start month (YYYY-MM)")
	endMonth := flag.String("end", "", "End month (YYYY-MM)")
	singleID := flag.Int("tournament", 0, "Single tournament ID to backfill")
	delay := flag.Int("delay", 12, "Seconds between deck requests")
	dryRun := flag.Bool("dry-run", false, "Show what would be fetched, no DB writes")
	flag.Parse()

	if *singleID == 0 && (*startMonth == "" || *endMonth == "") {
		fmt.Fprintln(os.Stderr, "Usage: go run cmd/backfill_decks/main.go -start YYYY-MM -end YYYY-MM")
		fmt.Fprintln(os.Stderr, "       go run cmd/backfill_decks/main.go -tournament 1294 [-dry-run]")
		os.Exit(1)
	}

	// Load .env
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Connect to DB
	dbPort, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	db, err := database.NewDB(database.Config{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     dbPort,
		User:     getEnv("DB_USER", "postgres"),
		Password: getEnv("DB_PASS", ""),
		DBName:   getEnv("DB_NAME", "cardztzar"),
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	client := ygoprodeck.NewClient()

	// Get tournaments to backfill
	var tournaments []backfillTournament
	if *singleID > 0 {
		tournaments, err = getSingleTournament(ctx, db, *singleID)
	} else {
		tournaments, err = getTournamentsToBackfill(ctx, db, *startMonth, *endMonth)
	}
	if err != nil {
		log.Fatalf("Failed to query tournaments: %v", err)
	}

	fmt.Printf("Found %d tournaments to backfill\n", len(tournaments))
	if *dryRun {
		for _, t := range tournaments {
			fmt.Printf("  [%d] %s (%s) - %s\n", t.ID, t.Name, t.EventDate.Format("2006-01-02"), t.Slug)
		}
		fmt.Println("(dry-run, no requests made)")
		return
	}

	// Backfill each tournament
	totalDecks := 0
	for i, t := range tournaments {
		fmt.Printf("\n[%d/%d] Tournament %d: %s (%s)\n", i+1, len(tournaments), t.ID, t.Name, t.EventDate.Format("2006-01-02"))

		// Fetch tournament HTML
		html, err := client.GetTournamentDetails(t.Slug)
		if err != nil {
			log.Printf("  ERROR fetching page: %v", err)
			// Retry once after 30s for rate limiting
			if isRetryable(err) {
				log.Printf("  Retrying in 30s...")
				time.Sleep(30 * time.Second)
				html, err = client.GetTournamentDetails(t.Slug)
				if err != nil {
					log.Printf("  ERROR retry failed: %v, skipping", err)
					continue
				}
			} else {
				continue
			}
		}

		// Extract deck IDs
		deckIDs := ygoprodeck.ExtractDeckIDs(html)
		if len(deckIDs) == 0 {
			fmt.Printf("  No deck profiles found on page\n")
			continue
		}
		fmt.Printf("  Found %d deck IDs\n", len(deckIDs))

		// Fetch each deck
		inserted := 0
		for j, deckID := range deckIDs {
			if j > 0 {
				time.Sleep(time.Duration(*delay) * time.Second)
			}

			deckInfo, err := client.GetDeckInfo(deckID)
			if err != nil {
				log.Printf("  Deck %d failed: %v", deckID, err)
				if isRetryable(err) {
					time.Sleep(30 * time.Second)
					deckInfo, err = client.GetDeckInfo(deckID)
					if err != nil {
						continue
					}
				} else {
					continue
				}
			}

			// Build deck profile
			mainDeck, _ := json.Marshal(deckInfo.MainDeck)
			extraDeck, _ := json.Marshal(deckInfo.ExtraDeck)
			sideDeck, _ := json.Marshal(deckInfo.SideDeck)

			var placement *int
			if deckInfo.TournamentPlacement != "" {
				if p, err := ygoprodeck.ParsePlacement(deckInfo.TournamentPlacement); err == nil {
					placement = &p
				}
			}

			profileURL := fmt.Sprintf("https://ygoprodeck.com/deck/?deckid=%d", deckID)
			dp := &database.DeckProfile{
				TournamentID: t.ID,
				PlayerName:   deckInfo.TournamentPlayer,
				DeckName:     &deckInfo.DeckName,
				Placement:    placement,
				ProfileURL:   &profileURL,
				MainDeck:     string(mainDeck),
				ExtraDeck:    string(extraDeck),
				SideDeck:     string(sideDeck),
			}

			if err := db.InsertDeckProfile(ctx, dp); err != nil {
				log.Printf("  DB insert failed for %s: %v", deckInfo.TournamentPlayer, err)
				continue
			}
			inserted++
			fmt.Printf("  [%d/%d] %s - %s\n", j+1, len(deckIDs), deckInfo.TournamentPlayer, deckInfo.DeckName)
		}

		totalDecks += inserted
		fmt.Printf("  Inserted %d/%d decks\n", inserted, len(deckIDs))

		// Small delay between tournaments
		time.Sleep(5 * time.Second)
	}

	fmt.Printf("\n=== Backfill Complete ===\n")
	fmt.Printf("Tournaments processed: %d\n", len(tournaments))
	fmt.Printf("Total decks inserted: %d\n", totalDecks)
}

func getTournamentsToBackfill(ctx context.Context, db *database.DB, startMonth, endMonth string) ([]backfillTournament, error) {
	startDate, err := time.Parse("2006-01", startMonth)
	if err != nil {
		return nil, fmt.Errorf("invalid start month %q: %w", startMonth, err)
	}
	endDate, err := time.Parse("2006-01", endMonth)
	if err != nil {
		return nil, fmt.Errorf("invalid end month %q: %w", endMonth, err)
	}
	// End date is exclusive: first day of month after endMonth
	endDate = endDate.AddDate(0, 1, 0)

	return queryTournaments(ctx, db, startDate, endDate, 0)
}

func getSingleTournament(ctx context.Context, db *database.DB, id int) ([]backfillTournament, error) {
	return queryTournaments(ctx, db, time.Time{}, time.Time{}, id)
}

func queryTournaments(ctx context.Context, db *database.DB, startDate, endDate time.Time, singleID int) ([]backfillTournament, error) {
	var query string
	var args []interface{}

	if singleID > 0 {
		query = `
			SELECT t.id, t.slug, t.event_date, t.name
			FROM tournaments t
			LEFT JOIN deck_profiles dp ON dp.tournament_id = t.id
			WHERE t.id = $1
			GROUP BY t.id, t.slug, t.event_date, t.name
			HAVING COUNT(dp.id) = 0`
		args = []interface{}{singleID}
	} else {
		query = `
			SELECT t.id, t.slug, t.event_date, t.name
			FROM tournaments t
			LEFT JOIN deck_profiles dp ON dp.tournament_id = t.id
			WHERE t.format = 'TCG' AND t.player_count > 0 AND t.slug IS NOT NULL
			  AND t.event_date >= $1 AND t.event_date < $2
			GROUP BY t.id, t.slug, t.event_date, t.name
			HAVING COUNT(dp.id) = 0
			ORDER BY t.event_date`
		args = []interface{}{startDate, endDate}
	}

	rows, err := db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tournaments []backfillTournament
	for rows.Next() {
		var t backfillTournament
		if err := rows.Scan(&t.ID, &t.Slug, &t.EventDate, &t.Name); err != nil {
			return nil, err
		}
		tournaments = append(tournaments, t)
	}
	return tournaments, rows.Err()
}

func isRetryable(err error) bool {
	msg := err.Error()
	return len(msg) >= 6 && (msg[len(msg)-3:] == "403" || msg[len(msg)-3:] == "429" || msg[len(msg)-3:] == "503")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
