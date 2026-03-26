package ygoprodeck

import (
	"context"
	"log"
	"time"

	"github.com/CardzTsar/Tournamet-results-monitor/pkg/database"
)

// NewMonitor creates a new monitor for tournaments
func NewMonitor(db *database.DB) *Monitor {
	return &Monitor{
		database:           db,
		client:             NewClient(),
		cancellation:       make(chan struct{}),
		tournamentMonitors: make(map[int]*TournamentMonitor),
	}
}

// Start starts the monitor
func (m *Monitor) Start() {
	m.mutex.Lock()
	if m.isRunning {
		m.mutex.Unlock()
		return
	}
	m.isRunning = true
	m.mutex.Unlock()

	go m.run()
}

// Stop stops the monitor and all tournament monitors
func (m *Monitor) Stop() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if !m.isRunning {
		return
	}

	// Stop all tournament monitors
	m.tournamentMonitorsMu.RLock()
	for _, tm := range m.tournamentMonitors {
		tm.Stop()
	}
	m.tournamentMonitorsMu.RUnlock()

	close(m.cancellation)
	m.isRunning = false
}

// run runs the monitor in a loop
func (m *Monitor) run() {
	ctx := context.Background()
	interval := 5 * time.Minute // Check every 5 minutes

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Load existing tournaments and start monitors for recent ones
	m.loadExistingTournaments(ctx)

	// Collect immediately on start
	m.collectOnce(ctx)

	// Also check for expired tournament monitors periodically
	cleanupTicker := time.NewTicker(1 * time.Hour)
	defer cleanupTicker.Stop()

	for {
		select {
		case <-m.cancellation:
			return
		case <-ticker.C:
			m.collectOnce(ctx)
		case <-cleanupTicker.C:
			m.cleanupExpiredMonitors()
		}
	}
}

// collectOnce performs a single collection cycle
func (m *Monitor) collectOnce(ctx context.Context) {
	// Silent collection - only log errors and new tournaments

	// Get existing tournament IDs from database
	existingIDs, err := m.database.GetAllTournamentIDs(ctx)
	if err != nil {
		m.handleError(err)
		return
	}

	// Create a map for quick lookup
	existingMap := make(map[int]bool)
	for _, id := range existingIDs {
		existingMap[id] = true
	}

	// Fetch tournaments from API
	resp, err := m.client.GetTournaments()
	if err != nil {
		m.handleError(err)
		return
	}

	// Convert API data to database models
	var tournaments []database.Tournament
	newCount := 0

	for _, t := range resp.Data {
		// Parse event date
		eventDate, err := time.Parse("2006-01-02", t.EventDate)
		if err != nil {
			log.Printf("[Tournament Monitor] Failed to parse date for tournament %d: %v", t.ID, err)
			continue
		}

		tournament := database.Tournament{
			ID:                       t.ID,
			Name:                     t.Name,
			Country:                  t.Country,
			EventDate:                eventDate,
			Winner:                   t.Winner,
			Format:                   t.Format,
			Slug:                     t.Slug,
			PlayerCount:              t.PlayerCount,
			IsApproximatePlayerCount: t.IsApproximatePlayerCount == 1,
		}

		tournaments = append(tournaments, tournament)

		// Check if this is a new tournament
		if !existingMap[t.ID] {
			newCount++
		}
	}

	// Insert/update all tournaments
	if err := m.database.InsertTournaments(ctx, tournaments); err != nil {
		m.handleError(err)
		return
	}

	m.statsMutex.Lock()
	m.collectionCount++
	m.newTournamentCount += int64(newCount)
	m.lastCollectionTime = time.Now()
	m.statsMutex.Unlock()

	// Only log when we find NEW tournaments
	if newCount > 0 {
		log.Printf("Found %d new tournaments", newCount)

		// Start individual monitors for new tournaments
		for _, t := range tournaments {
			if !existingMap[t.ID] {
				m.startTournamentMonitor(t)
			}
		}
	}
}

// startTournamentMonitor creates and starts a monitor for a specific tournament
func (m *Monitor) startTournamentMonitor(tournament database.Tournament) {
	m.tournamentMonitorsMu.Lock()
	defer m.tournamentMonitorsMu.Unlock()

	// Check if monitor already exists
	if _, exists := m.tournamentMonitors[tournament.ID]; exists {
		return
	}

	// Don't monitor tournaments older than 1 month
	oneMonthAgo := time.Now().AddDate(0, -1, 0)
	if tournament.EventDate.Before(oneMonthAgo) {
		// Silently skip old tournaments
		return
	}

	// Create and start monitor
	tm := NewTournamentMonitor(tournament.ID, tournament.Name, tournament.Slug, tournament.EventDate, m.database)
	m.tournamentMonitors[tournament.ID] = tm
	tm.Start()

	log.Printf("Started monitor for: %s (ID: %d, expires: %s)",
		tournament.Name, tournament.ID, tm.expiresAt.Format("2006-01-02"))

	// Small delay between starting monitors to avoid hammering the API all at once
	time.Sleep(2 * time.Second)
}

// loadExistingTournaments loads tournaments from DB and starts monitors for recent ones
func (m *Monitor) loadExistingTournaments(ctx context.Context) {
	// Get all tournament IDs
	ids, err := m.database.GetAllTournamentIDs(ctx)
	if err != nil {
		log.Printf("Failed to load existing tournaments: %v", err)
		return
	}

	oneMonthAgo := time.Now().AddDate(0, -1, 0)
	loadedCount := 0

	// Start monitors for tournaments from the last month
	for _, id := range ids {
		tournament, err := m.database.GetTournamentByID(ctx, id)
		if err != nil {
			continue
		}

		// Only monitor tournaments from the last month
		if tournament.EventDate.After(oneMonthAgo) {
			m.startTournamentMonitor(*tournament)
			loadedCount++
		}
	}

	if loadedCount > 0 {
		log.Printf("Loaded %d existing tournaments for monitoring", loadedCount)
	}
}

// cleanupExpiredMonitors removes and stops expired tournament monitors
func (m *Monitor) cleanupExpiredMonitors() {
	m.tournamentMonitorsMu.Lock()
	defer m.tournamentMonitorsMu.Unlock()

	var toRemove []int
	for id, tm := range m.tournamentMonitors {
		if tm.IsExpired() {
			tm.Stop()
			toRemove = append(toRemove, id)
		}
	}

	for _, id := range toRemove {
		delete(m.tournamentMonitors, id)
	}

	if len(toRemove) > 0 {
		log.Printf("Cleaned up %d expired tournament monitors", len(toRemove))
	}
}

// GetActiveTournamentMonitors returns count of active tournament monitors
func (m *Monitor) GetActiveTournamentMonitors() int {
	m.tournamentMonitorsMu.RLock()
	defer m.tournamentMonitorsMu.RUnlock()
	return len(m.tournamentMonitors)
}

// handleError handles errors that occur during collection
func (m *Monitor) handleError(err error) {
	m.statsMutex.Lock()
	m.errorCount++
	m.statsMutex.Unlock()

	log.Printf("[Tournament Monitor] Error: %v", err)
}

// GetStats returns monitor statistics
func (m *Monitor) GetStats() MonitorStats {
	m.statsMutex.RLock()
	defer m.statsMutex.RUnlock()
	m.lastCollectionLock.RLock()
	defer m.lastCollectionLock.RUnlock()

	return MonitorStats{
		CollectionCount:    m.collectionCount,
		ErrorCount:         m.errorCount,
		NewTournamentCount: m.newTournamentCount,
		LastCollectionTime: m.lastCollectionTime,
		IsRunning:          m.isRunning,
	}
}
