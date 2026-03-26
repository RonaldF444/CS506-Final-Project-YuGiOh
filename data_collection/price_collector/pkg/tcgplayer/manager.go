package tcgplayer

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
)

// Manager manages multiple monitors
type Manager struct {
	database      *database.DB
	monitors      map[int]*Monitor
	monitorsMutex sync.RWMutex
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewManager creates a new monitor manager
func NewManager(db *database.DB) *Manager {
	ctx, cancel := context.WithCancel(context.Background())
	return &Manager{
		database: db,
		monitors: make(map[int]*Monitor),
		ctx:      ctx,
		cancel:   cancel,
	}
}

// Start starts the manager and all monitors
func (m *Manager) Start() error {
	// Load initial monitors
	if err := m.loadMonitors(); err != nil {
		return err
	}

	// Start refresh loop
	go m.refreshLoop()

	log.Printf("Monitor manager started with %d monitors", len(m.monitors))
	return nil
}

// Stop stops the manager and all monitors
func (m *Manager) Stop() {
	m.cancel()

	m.monitorsMutex.Lock()
	for _, monitor := range m.monitors {
		monitor.Stop()
	}
	m.monitors = make(map[int]*Monitor)
	m.monitorsMutex.Unlock()

	log.Println("Monitor manager stopped")
}

// loadMonitors loads all watched printings and creates monitors
func (m *Manager) loadMonitors() error {
	var productIDs []int
	var err error

	// Check if CODE env variable is set to monitor only one card
	setCode := os.Getenv("CODE")
	if setCode != "" {
		log.Printf("CODE env variable set: %s - monitoring single card only", setCode)
		productID, err := m.database.GetProductIDBySetCode(m.ctx, setCode)
		if err != nil {
			return fmt.Errorf("failed to find product with set code %s: %w", setCode, err)
		}
		productIDs = []int{productID}
		log.Printf("Found product ID %d for set code %s", productID, setCode)
	} else {
		// Load all watched printings
		productIDs, err = m.database.GetWatchedPrintings(m.ctx)
		if err != nil {
			return err
		}
	}

	m.monitorsMutex.Lock()
	defer m.monitorsMutex.Unlock()

	// Create a map of current product IDs
	currentProductIDs := make(map[int]bool)
	for _, productID := range productIDs {
		currentProductIDs[productID] = true
	}

	// Create monitors for new printings
	for _, productID := range productIDs {
		if _, exists := m.monitors[productID]; !exists {
			// Get card info from database
			cardName, setCode, err := m.database.GetWatchedPrintingInfo(m.ctx, productID)
			if err != nil {
				// Use placeholder if not found
				cardName = "Unknown"
				setCode = ""
			}
			monitor := NewMonitor(productID, cardName, setCode, m.database)
			monitor.Start()
			m.monitors[productID] = monitor
			log.Printf("Started monitor for %s (%s) - Product ID: %d", cardName, setCode, productID)
			time.Sleep(100 * time.Millisecond)
		}
	}

	// Remove monitors for printings that are no longer watched
	for productID, monitor := range m.monitors {
		if !currentProductIDs[productID] {
			monitor.Stop()
			delete(m.monitors, productID)
			log.Printf("Stopped monitor for Product ID: %d", productID)
		}
	}

	return nil
}

// refreshLoop periodically refreshes the monitor list
func (m *Manager) refreshLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			if err := m.loadMonitors(); err != nil {
				log.Printf("Failed to refresh monitors: %v", err)
			}
		}
	}
}

// GetStats returns statistics for all monitors
func (m *Manager) GetStats() []MonitorStats {
	m.monitorsMutex.RLock()
	defer m.monitorsMutex.RUnlock()

	stats := make([]MonitorStats, 0, len(m.monitors))
	for _, monitor := range m.monitors {
		stats = append(stats, monitor.GetStats())
	}

	return stats
}

// GetMonitorCount returns the number of active monitors
func (m *Manager) GetMonitorCount() int {
	m.monitorsMutex.RLock()
	defer m.monitorsMutex.RUnlock()
	return len(m.monitors)
}
