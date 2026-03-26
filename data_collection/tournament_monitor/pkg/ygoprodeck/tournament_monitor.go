package ygoprodeck

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"time"

	"github.com/CardzTsar/Tournamet-results-monitor/pkg/database"
)

// NewTournamentMonitor creates a new monitor for a specific tournament
func NewTournamentMonitor(tournamentID int, name, slug string, eventDate time.Time, db *database.DB) *TournamentMonitor {
	// Monitor expires 1 month after the event
	expiresAt := eventDate.AddDate(0, 1, 0)

	return &TournamentMonitor{
		TournamentID:   tournamentID,
		TournamentName: name,
		TournamentSlug: slug,
		database:       db,
		client:         NewClient(),
		cancellation:   make(chan struct{}),
		expiresAt:      expiresAt,
	}
}

// Start starts the monitor
func (tm *TournamentMonitor) Start() {
	tm.mutex.Lock()
	if tm.isRunning {
		tm.mutex.Unlock()
		return
	}
	tm.isRunning = true
	tm.mutex.Unlock()

	go tm.run()
}

// Stop stops the monitor
func (tm *TournamentMonitor) Stop() {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	if !tm.isRunning {
		return
	}

	close(tm.cancellation)
	tm.isRunning = false
}

// IsExpired checks if the monitor should be stopped (1 month passed)
func (tm *TournamentMonitor) IsExpired() bool {
	return time.Now().After(tm.expiresAt)
}

// run runs the monitor in a loop
func (tm *TournamentMonitor) run() {
	ctx := context.Background()
	interval := 2 * time.Hour // Check every 2 hours

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Collect immediately on start
	tm.collectOnce(ctx)

	for {
		select {
		case <-tm.cancellation:
			return
		case <-ticker.C:
			// Check if expired
			if tm.IsExpired() {
				tm.Stop()
				return
			}
			tm.collectOnce(ctx)
		}
	}
}

// collectOnce performs a single collection cycle
func (tm *TournamentMonitor) collectOnce(ctx context.Context) {
	// Silent collection - only log errors and new profiles

	// Get tournament page HTML
	html, err := tm.client.GetTournamentDetails(tm.TournamentSlug)
	if err != nil {
		tm.handleError(fmt.Errorf("failed to get tournament page: %w", err))
		return
	}

	// Extract deck IDs from HTML
	deckIDs := ExtractDeckIDs(html)
	if len(deckIDs) == 0 {
		// No deck profiles found - silent return
		tm.statsMutex.Lock()
		tm.collectionCount++
		tm.lastCollectionTime = time.Now()
		tm.statsMutex.Unlock()
		return
	}

	// Get current count from database
	currentCount, err := tm.database.GetDeckProfileCount(ctx, tm.TournamentID)
	if err != nil {
		tm.handleError(err)
		return
	}

	newProfilesInThisRun := 0

	// Fetch each deck profile
	for _, deckID := range deckIDs {
		// IMPORTANT: VERY aggressive rate limiting to avoid Cloudflare bans
		// Wait 10-15 seconds between each request
		time.Sleep(time.Duration(10+deckID%6) * time.Second)

		deckInfo, err := tm.client.GetDeckInfo(deckID)
		if err != nil {
			// Log error type only, not full response
			if len(err.Error()) > 100 {
				log.Printf("[Tournament %d] Deck %d failed: %s", tm.TournamentID, deckID, err.Error()[:100])
			} else {
				log.Printf("[Tournament %d] Deck %d failed: %v", tm.TournamentID, deckID, err)
			}
			continue
		}

		// Convert card IDs to JSON strings
		mainDeck, _ := json.Marshal(deckInfo.MainDeck)
		extraDeck, _ := json.Marshal(deckInfo.ExtraDeck)
		sideDeck, _ := json.Marshal(deckInfo.SideDeck)

		// Parse placement
		var placement *int
		if deckInfo.TournamentPlacement != "" {
			if p, err := ParsePlacement(deckInfo.TournamentPlacement); err == nil {
				placement = &p
			}
		}

		// Create deck profile
		profileURL := fmt.Sprintf("https://ygoprodeck.com/deck/?deckid=%d", deckID)
		deckProfile := &database.DeckProfile{
			TournamentID: tm.TournamentID,
			PlayerName:   deckInfo.TournamentPlayer,
			DeckName:     &deckInfo.DeckName,
			Placement:    placement,
			ProfileURL:   &profileURL,
			MainDeck:     string(mainDeck),
			ExtraDeck:    string(extraDeck),
			SideDeck:     string(sideDeck),
		}

		// Insert into database
		if err := tm.database.InsertDeckProfile(ctx, deckProfile); err != nil {
			log.Printf("[Tournament %d] Failed to insert deck profile for %s: %v",
				tm.TournamentID, deckInfo.TournamentPlayer, err)
			continue
		}
	}

	// Get updated count
	updatedCount, err := tm.database.GetDeckProfileCount(ctx, tm.TournamentID)
	if err == nil {
		newProfilesInThisRun = updatedCount - currentCount
	}

	tm.statsMutex.Lock()
	tm.collectionCount++
	tm.newProfilesCount += int64(newProfilesInThisRun)
	tm.lastCollectionTime = time.Now()
	tm.statsMutex.Unlock()

	// Only log when we find NEW profiles
	if newProfilesInThisRun > 0 {
		log.Printf("[Tournament %d - %s] Found %d new deck profiles (total: %d)",
			tm.TournamentID, tm.TournamentName, newProfilesInThisRun, updatedCount)
	}
}

// handleError handles errors that occur during collection
func (tm *TournamentMonitor) handleError(err error) {
	tm.statsMutex.Lock()
	tm.errorCount++
	tm.statsMutex.Unlock()

	log.Printf("[Tournament %d] Error: %v", tm.TournamentID, err)
}

// GetStats returns monitor statistics
func (tm *TournamentMonitor) GetStats() TournamentMonitorStats {
	tm.statsMutex.RLock()
	defer tm.statsMutex.RUnlock()

	return TournamentMonitorStats{
		TournamentID:     tm.TournamentID,
		TournamentName:   tm.TournamentName,
		CollectionCount:  tm.collectionCount,
		NewProfilesCount: tm.newProfilesCount,
		ErrorCount:       tm.errorCount,
		LastCollection:   tm.lastCollectionTime,
		ExpiresAt:        tm.expiresAt,
		IsRunning:        tm.isRunning,
	}
}

// ParsePlacement converts placement strings like "Winner", "Top 4", "Top 8" to integers
func ParsePlacement(placement string) (int, error) {
	switch placement {
	case "Winner", "1st", "1st Place":
		return 1, nil
	case "2nd", "2nd Place":
		return 2, nil
	case "Top 4":
		return 4, nil
	case "Top 8":
		return 8, nil
	case "Top 16":
		return 16, nil
	case "Top 32":
		return 32, nil
	default:
		// Try to parse as number
		return strconv.Atoi(placement)
	}
}

// contains checks if a string contains a substring (case insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) &&
		(s[:len(substr)] == substr || s[len(s)-len(substr):] == substr ||
			len(s) > len(substr)*2))
}
