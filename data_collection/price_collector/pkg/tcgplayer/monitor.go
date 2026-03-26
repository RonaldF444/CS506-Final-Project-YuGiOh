package tcgplayer

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
)

type Monitor struct {
	ProductID          int
	CardName           string
	SetCode            string
	database           *database.DB
	client             *Client
	cancellation       chan struct{}
	isRunning          bool
	mutex              sync.Mutex
	lastCollectionTime time.Time
	lastCollectionLock sync.RWMutex
	collectionCount    int64
	errorCount         int64
	statsMutex         sync.RWMutex
}

// NewMonitor creates a new monitor for a product
func NewMonitor(productID int, cardName, setCode string, db *database.DB) *Monitor {
	return &Monitor{
		ProductID:    productID,
		CardName:     cardName,
		SetCode:      setCode,
		database:     db,
		client:       NewClient(),
		cancellation: make(chan struct{}),
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

// Stop stops the monitor
func (m *Monitor) Stop() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	if !m.isRunning {
		return
	}

	close(m.cancellation)
	m.isRunning = false
}

// run runs the monitor in a loop
func (m *Monitor) run() {
	ctx := context.Background()
	interval := 10 * time.Minute

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Collect immediately on start
	m.collectOnce(ctx)

	for {
		select {
		case <-m.cancellation:
			return
		case <-ticker.C:
			m.collectOnce(ctx)
		}
	}
}

// collectOnce performs a single collection cycle
func (m *Monitor) collectOnce(ctx context.Context) {
	log.Printf("[%s] [Monitor %d] Starting collection...", time.Now().Format("15:04:05"), m.ProductID)

	// Get the latest sale timestamp we've seen before
	lastSaleTime, err := m.database.GetLatestSaleTimestamp(ctx, m.ProductID)
	if err != nil {
		// If we can't get it, use a very old date
		lastSaleTime = time.Time{}
	}

	// Get product details
	details, err := m.client.GetProductDetails(m.ProductID)
	if err != nil {
		m.handleError(err)
		return
	}

	// Save printing info (upsert)
	printing := &database.Printing{
		ProductID:   m.ProductID,
		CardName:    details.ProductName,
		SetCode:     details.CustomAttributes.Number,
		SetName:     details.SetName,
		Rarity:      details.CustomAttributes.CardTypeB,
		ProductLine: "yugioh",
	}
	if err := m.database.InsertPrinting(ctx, printing); err != nil {
		m.handleError(err)
		return
	}

	// Save market snapshot
	snapshot := &database.MarketSnapshot{
		Time:          time.Now(),
		ProductID:     m.ProductID,
		MarketPrice:   details.MarketPrice,
		LowestPrice:   details.LowestPrice,
		MedianPrice:   details.MedianPrice,
		TotalListings: int(details.Listings),
	}
	if err := m.database.InsertMarketSnapshot(ctx, snapshot); err != nil {
		m.handleError(err)
		return
	}

	// Get recent sales
	salesResp, err := m.client.GetLatestSales(m.ProductID, 50)
	if err != nil {
		m.handleError(err)
		return
	}

	// Convert and filter for new sales only
	var sales []database.Sale
	newSalesCount := 0
	for _, s := range salesResp.Data {
		// Only count sales that are newer than what we've already seen
		if s.OrderDate.After(lastSaleTime) {
			newSalesCount++
		}
		sales = append(sales, database.Sale{
			ProductID:     m.ProductID,
			OrderDate:     s.OrderDate,
			Condition:     s.Condition,
			Variant:       s.Variant,
			Language:      s.Language,
			Quantity:      s.Quantity,
			PurchasePrice: s.PurchasePrice,
			ShippingPrice: s.ShippingPrice,
		})
	}

	if err := m.database.InsertSales(ctx, sales); err != nil {
		m.handleError(err)
		return
	}

	m.statsMutex.Lock()
	m.collectionCount++
	m.lastCollectionTime = time.Now()
	m.statsMutex.Unlock()

	if newSalesCount > 0 {
		log.Printf("[%s] [Monitor %d] Collection complete - Price: $%.2f, %d NEW sales found!",
			time.Now().Format("15:04:05"), m.ProductID, details.MarketPrice, newSalesCount)
	} else {
		log.Printf("[%s] [Monitor %d] Collection complete - Price: $%.2f, No new sales",
			time.Now().Format("15:04:05"), m.ProductID, details.MarketPrice)
	}

	// Rate limit - be nice to TCGPlayer
	time.Sleep(200 * time.Millisecond)
}

// handleError handles errors that occur during collection
func (m *Monitor) handleError(err error) {
	m.statsMutex.Lock()
	m.errorCount++
	m.statsMutex.Unlock()

	log.Printf("[Monitor %d] Error: %v", m.ProductID, err)
}

// GetStats returns monitor statistics
func (m *Monitor) GetStats() MonitorStats {
	m.statsMutex.RLock()
	defer m.statsMutex.RUnlock()
	m.lastCollectionLock.RLock()
	defer m.lastCollectionLock.RUnlock()

	return MonitorStats{
		ProductID:          m.ProductID,
		CardName:           m.CardName,
		SetCode:            m.SetCode,
		CollectionCount:    m.collectionCount,
		ErrorCount:         m.errorCount,
		LastCollectionTime: m.lastCollectionTime,
		IsRunning:          m.isRunning,
	}
}
