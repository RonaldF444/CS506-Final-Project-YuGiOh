package tcgplayer

import (
	"net/http"
	"sync"
	"time"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
)

// Client represents the TCGPlayer API client
type Client struct {
	httpClient *http.Client
	baseURL    string
	cookies    map[string]string
}

// SearchRequest is the body for the search API
type SearchRequest struct {
	Algorithm string         `json:"algorithm"`
	From      int            `json:"from"`
	Size      int            `json:"size"`
	Filters   SearchFilters  `json:"filters"`
	Settings  SearchSettings `json:"settings"`
}

type SearchFilters struct {
	Term SearchTerm `json:"term"`
}

type SearchTerm struct {
	ProductLineName []string `json:"productLineName"`
	ProductName     []string `json:"productName,omitempty"`
}

type SearchSettings struct {
	UseFuzzySearch bool `json:"useFuzzySearch"`
}

// SearchResponse from the search API
type SearchResponse struct {
	Errors  []interface{}   `json:"errors"`
	Results []SearchResults `json:"results"`
}

type SearchResults struct {
	Results      []Product `json:"results"`
	TotalResults int       `json:"totalResults"`
}

// Product represents a card printing from search results
type Product struct {
	ProductID        float64          `json:"productId"` // Changed
	ProductName      string           `json:"productName"`
	SetName          string           `json:"setName"`
	SetID            float64          `json:"setId"` // Changed
	RarityName       string           `json:"rarityName"`
	MarketPrice      float64          `json:"marketPrice"`
	LowestPrice      float64          `json:"lowestPrice"`
	MedianPrice      float64          `json:"medianPrice"`
	TotalListings    float64          `json:"totalListings"` // Changed
	CustomAttributes CustomAttributes `json:"customAttributes"`
	ProductLineName  string           `json:"productLineName"`
	Listings         []Listing        `json:"listings,omitempty"`
}

type CustomAttributes struct {
	Number      string   `json:"number"`
	Description string   `json:"description"`
	Attribute   []string `json:"attribute"`
	MonsterType []string `json:"monsterType"`
	CardTypeB   string   `json:"cardTypeB"`
	Level       string   `json:"level"`
	Attack      string   `json:"attack"`
	Defense     string   `json:"defense"`
}

type Listing struct {
	ListingID     float64 `json:"listingId"` // Changed from int64 to float64
	Price         float64 `json:"price"`
	ShippingPrice float64 `json:"shippingPrice"`
	Condition     string  `json:"condition"`
	Printing      string  `json:"printing"`
	Language      string  `json:"language"`
	Quantity      float64 `json:"quantity"` // Also change this to float64
	SellerName    string  `json:"sellerName"`
	SellerRating  float64 `json:"sellerRating"`
}

// ProductDetails from the details endpoint
type ProductDetails struct {
	ProductID        float64          `json:"productId"`
	ProductName      string           `json:"productName"`
	SetCode          string           `json:"setCode"`
	SetName          string           `json:"setName"`
	MarketPrice      float64          `json:"marketPrice"`
	LowestPrice      float64          `json:"lowestPrice"`
	MedianPrice      float64          `json:"medianPrice"`
	Sellers          float64          `json:"sellers"`
	Listings         float64          `json:"listings"`
	CustomAttributes CustomAttributes `json:"customAttributes"`
	SKUs             []SKU            `json:"skus"`
}

type SKU struct {
	SKU       int    `json:"sku"`
	Condition string `json:"condition"`
	Variant   string `json:"variant"`
	Language  string `json:"language"`
}

// SalesResponse from the latest sales endpoint
type SalesResponse struct {
	Data         []Sale `json:"data"`
	ResultCount  int    `json:"resultCount"`
	TotalResults int    `json:"totalResults"`
}

type Sale struct {
	Condition     string    `json:"condition"`
	Variant       string    `json:"variant"`
	Language      string    `json:"language"`
	Quantity      int       `json:"quantity"`
	Title         string    `json:"title"`
	PurchasePrice float64   `json:"purchasePrice"`
	ShippingPrice float64   `json:"shippingPrice"`
	OrderDate     time.Time `json:"orderDate"`
}

// CardPrinting is our internal storage format
type CardPrinting struct {
	ProductID        int       `json:"product_id"`
	CardName         string    `json:"card_name"`
	SetCode          string    `json:"set_code"`
	SetName          string    `json:"set_name"`
	Rarity           string    `json:"rarity"`
	MarketPrice      float64   `json:"market_price"`
	LowestPrice      float64   `json:"lowest_price"`
	MedianPrice      float64   `json:"median_price"`
	AverageSalePrice float64   `json:"average_sale_price"`
	TotalListings    int       `json:"total_listings"`
	Sellers          int       `json:"sellers"`
	RecentSales      []Sale    `json:"recent_sales"`
	Timestamp        time.Time `json:"timestamp"`
}

// MonitorStats represents statistics for a monitor
type MonitorStats struct {
	ProductID          int
	CardName           string
	SetCode            string
	CollectionCount    int64
	ErrorCount         int64
	LastCollectionTime time.Time
	IsRunning          bool
}

// PaginatedSalesResponse from the paginated sales endpoint (requires auth)
type PaginatedSalesResponse struct {
	PreviousPage string `json:"previousPage"` // "Yes" or "No"
	NextPage     string `json:"nextPage"`     // "Yes" or "No"
	ResultCount  int    `json:"resultCount"`
	TotalResults int    `json:"totalResults"`
	Data         []Sale `json:"data"`
}

// SalesRequest for the paginated sales endpoint
type SalesRequest struct {
	Conditions  []string `json:"conditions"`
	Languages   []string `json:"languages"`
	Variants    []string `json:"variants"`
	ListingType string   `json:"listingType"`
	Offset      int      `json:"offset"`
	Limit       int      `json:"limit"`
	Time        int64    `json:"time"` // Unix timestamp in milliseconds
}

// LoginResponse from TCGPlayer login endpoint
type LoginResponse struct {
	LoginResult string `json:"loginResult"`
}

// Backfiller handles historical sales backfilling
type Backfiller struct {
	db     *database.DB
	client *Client
}

// BackfillStats tracks backfill progress
type BackfillStats struct {
	ProductsProcessed int
	SuccessCount      int
	ErrorCount        int
	NoSalesCount      int
	TotalSales        int
	TotalInserted     int
	mu                sync.Mutex
}

// PriceHistoryResponse from the Infinite API
type PriceHistoryResponse struct {
	Count  int                `json:"count"`
	Result []PriceHistorySKU  `json:"result"`
}

// PriceHistorySKU represents price history for a specific SKU (condition/variant)
type PriceHistorySKU struct {
	SkuID                     string        `json:"skuId"`
	Variant                   string        `json:"variant"`
	Language                  string        `json:"language"`
	Condition                 string        `json:"condition"`
	AverageDailyQuantitySold  string        `json:"averageDailyQuantitySold"`
	AverageDailyTransactionCount string     `json:"averageDailyTransactionCount"`
	TotalQuantitySold         string        `json:"totalQuantitySold"`
	TotalTransactionCount     string        `json:"totalTransactionCount"`
	Buckets                   []PriceBucket `json:"buckets"`
}

// PriceBucket represents a time bucket of price/sales data
type PriceBucket struct {
	MarketPrice              string `json:"marketPrice"`
	QuantitySold             string `json:"quantitySold"`
	LowSalePrice             string `json:"lowSalePrice"`
	LowSalePriceWithShipping string `json:"lowSalePriceWithShipping"`
	HighSalePrice            string `json:"highSalePrice"`
	HighSalePriceWithShipping string `json:"highSalePriceWithShipping"`
	TransactionCount         string `json:"transactionCount"`
	BucketStartDate          string `json:"bucketStartDate"`
}
