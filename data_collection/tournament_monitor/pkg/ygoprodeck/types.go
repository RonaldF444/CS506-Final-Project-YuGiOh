package ygoprodeck

import (
	"net/http"
	"sync"
	"time"

	"github.com/CardzTsar/Tournamet-results-monitor/pkg/database"
)

// Client for YGOProDeck API
type Client struct {
	httpClient *http.Client
	baseURL    string
}

// TournamentResponse represents the API response
type TournamentResponse struct {
	Data []TournamentData `json:"data"`
}

// TournamentData represents a tournament from the API
type TournamentData struct {
	ID                       int     `json:"id"`
	Name                     string  `json:"name"`
	Country                  string  `json:"country"`
	EventDate                string  `json:"event_date"`
	Winner                   *string `json:"winner"`
	Format                   string  `json:"format"`
	Slug                     string  `json:"slug"`
	PlayerCount              int     `json:"player_count"`
	IsApproximatePlayerCount int     `json:"is_approximate_player_count"`
}

// DeckInfoResponse represents the deck profile API response
type DeckInfoResponse struct {
	UserID              int      `json:"userid"`
	DeckName            string   `json:"deckname"`
	MainDeck            []string `json:"maindeck"`
	ExtraDeck           []string `json:"extradeck"`
	SideDeck            []string `json:"sidedeck"`
	Tournament          string   `json:"tournament"`
	TournamentPlayer    string   `json:"tournamentPlayer"`
	TournamentDate      string   `json:"tournamentDate"`
	TournamentPlacement string   `json:"tournamentPlacement"`
	TournamentSlug      string   `json:"tournamentslug"`
}

// Monitor monitors tournaments
type Monitor struct {
	database             *database.DB
	client               *Client
	cancellation         chan struct{}
	isRunning            bool
	mutex                sync.Mutex
	lastCollectionTime   time.Time
	lastCollectionLock   sync.RWMutex
	collectionCount      int64
	errorCount           int64
	statsMutex           sync.RWMutex
	newTournamentCount   int64
	tournamentMonitors   map[int]*TournamentMonitor // Track individual tournament monitors
	tournamentMonitorsMu sync.RWMutex
}

// MonitorStats contains statistics about the monitor
type MonitorStats struct {
	CollectionCount    int64
	ErrorCount         int64
	NewTournamentCount int64
	LastCollectionTime time.Time
	IsRunning          bool
}

// TournamentMonitor monitors a specific tournament for deck profiles
type TournamentMonitor struct {
	TournamentID       int
	TournamentName     string
	TournamentSlug     string
	database           *database.DB
	client             *Client
	cancellation       chan struct{}
	isRunning          bool
	mutex              sync.Mutex
	lastCollectionTime time.Time
	collectionCount    int64
	newProfilesCount   int64
	errorCount         int64
	statsMutex         sync.RWMutex
	expiresAt          time.Time // Monitor expires 1 month after tournament date
}

// TournamentMonitorStats contains statistics about a tournament monitor
type TournamentMonitorStats struct {
	TournamentID     int
	TournamentName   string
	CollectionCount  int64
	NewProfilesCount int64
	ErrorCount       int64
	LastCollection   time.Time
	ExpiresAt        time.Time
	IsRunning        bool
}

// CardInfoResponse represents the card database API response
type CardInfoResponse struct {
	Data []CardData `json:"data"`
}

// CardData represents a card from the database API
type CardData struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}
