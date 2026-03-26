package tcgplayer

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
	"log"
)

func NewClient() *Client {
	httpClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Configure proxy if env vars are set
	proxyHost := os.Getenv("PROXY_HOST")
	proxyPort := os.Getenv("PROXY_PORT")
	proxyUser := os.Getenv("PROXY_USER")
	proxyPass := os.Getenv("PROXY_PASS")

	if proxyHost != "" && proxyUser != "" && proxyPass != "" {
		proxyURL := &url.URL{
			Scheme: "http",
			User:   url.UserPassword(proxyUser, proxyPass),
			Host:   fmt.Sprintf("%s:%s", proxyHost, proxyPort),
		}
			httpClient.Transport = &http.Transport{
				Proxy: http.ProxyURL(proxyURL),
			}
		log.Printf("Using proxy: %s:%s", proxyHost, proxyPort)
	}

	client := &Client{
		httpClient: httpClient,
		baseURL:    "https://mp-search-api.tcgplayer.com",
	}
	cookies, _ := LoadCookies("cookies.json")
	client.cookies = cookies
	return client
}

// SearchCards searches for all printings of a card
func (c *Client) SearchCards(cardName string) ([]Product, error) {
	url := c.baseURL + "/v1/search/request?q=&isList=false"

	// Build request body - matching your exact PowerShell capture
	reqBody := map[string]interface{}{
		"algorithm": "sales_dismax",
		"from":      0,
		"size":      24,
		"filters": map[string]interface{}{
			"term": map[string]interface{}{
				"productLineName": []string{"yugioh"},
				"productName":     []string{cardName},
			},
			"range": map[string]interface{}{},
			"match": map[string]interface{}{},
		},
		"listingSearch": map[string]interface{}{
			"context": map[string]interface{}{
				"cart": map[string]interface{}{},
			},
			"filters": map[string]interface{}{
				"term": map[string]interface{}{
					"sellerStatus": "Live",
					"channelId":    0,
				},
				"range": map[string]interface{}{
					"quantity": map[string]interface{}{
						"gte": 1,
					},
				},
				"exclude": map[string]interface{}{
					"channelExclusion": 0,
				},
			},
		},
		"context": map[string]interface{}{
			"cart":            map[string]interface{}{},
			"shippingCountry": "US",
			"userProfile":     map[string]interface{}{},
		},
		"settings": map[string]interface{}{
			"useFuzzySearch": true,
			"didYouMean":     map[string]interface{}{},
		},
		"sort": map[string]interface{}{},
	}

	bodyJSON, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header = SearchHeaders()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var searchResp SearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(searchResp.Results) > 0 {
		return searchResp.Results[0].Results, nil
	}

	return []Product{}, nil
}

// GetLatestSales gets recent sales for a product
func (c *Client) GetLatestSales(productID int, limit int) (*SalesResponse, error) {
	url := fmt.Sprintf("https://mpapi.tcgplayer.com/v2/product/%d/latestsales", productID)

	body := fmt.Sprintf(`{"limit":%d}`, limit)
	req, err := http.NewRequest("POST", url, bytes.NewBufferString(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Build cookie header from client's cookies
	cookieHeader := ""
	if c.cookies != nil {
		cookieHeader = BuildCookieHeader(c.cookies)
	}
	req.Header = SalesHeaders(cookieHeader)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var salesResp SalesResponse
	if err := json.NewDecoder(resp.Body).Decode(&salesResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &salesResp, nil
}

// GetProductDetails gets detailed info for a specific product by ID
func (c *Client) GetProductDetails(productID int) (*ProductDetails, error) {
	url := fmt.Sprintf("https://mp-search-api.tcgplayer.com/v1/product/%d/details", productID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header = ProductDetailsHeaders()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var details ProductDetails
	if err := json.NewDecoder(resp.Body).Decode(&details); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &details, nil
}

// GetAllSales fetches ALL available sales with pagination (requires authentication)
// This uses the authenticated endpoint that returns previousPage/nextPage
func (c *Client) GetAllSales(productID int) ([]Sale, error) {
	var allSales []Sale
	offset := 0
	limit := 25 // API caps at 25 per request regardless of what we ask for

	baseURL := fmt.Sprintf("https://mpapi.tcgplayer.com/v2/product/%d/latestsales?mpfev=4528", productID)

	for {
		reqBody := SalesRequest{
			Conditions:  []string{},
			Languages:   []string{},
			Variants:    []string{},
			ListingType: "All",
			Offset:      offset,
			Limit:       limit,
			Time:        time.Now().UnixMilli(),
		}

		bodyJSON, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		req, err := http.NewRequest("POST", baseURL, bytes.NewBuffer(bodyJSON))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		// Build cookie header from client's cookies
		cookieHeader := ""
		if c.cookies != nil {
			cookieHeader = BuildCookieHeader(c.cookies)
		}
		req.Header = SalesHeaders(cookieHeader)

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to execute request: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()

			// Enhanced error message with more context
			if resp.StatusCode == 400 {
				return nil, fmt.Errorf("API returned 400 Bad Request for product %d (offset=%d): %s\nThis may indicate expired cookies or invalid request format",
					productID, offset, string(body))
			}
			if resp.StatusCode == 401 || resp.StatusCode == 403 {
				return nil, fmt.Errorf("API returned %d (Authentication/Authorization failed) for product %d: %s\nCookies may have expired - run 'go run cmd/login/main.go' to refresh",
					resp.StatusCode, productID, string(body))
			}
			return nil, fmt.Errorf("API returned status %d for product %d (offset=%d): %s",
				resp.StatusCode, productID, offset, string(body))
		}

		var salesResp PaginatedSalesResponse
		if err := json.NewDecoder(resp.Body).Decode(&salesResp); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}
		resp.Body.Close()

		allSales = append(allSales, salesResp.Data...)

		if salesResp.NextPage != "Yes" {
			break
		}

		offset += limit
		time.Sleep(2 * time.Second) // Increased delay between pagination requests to avoid rate limiting
	}

	return allSales, nil
}

// GetPriceHistory fetches historical price data from the Infinite API
// Range options: "monthly" (daily buckets ~30 days), "semi-annual" (weekly buckets ~6 months)
func (c *Client) GetPriceHistory(productID int, rangeType string) (*PriceHistoryResponse, error) {
	url := fmt.Sprintf("https://infinite-api.tcgplayer.com/price/history/%d/detailed?range=%s", productID, rangeType)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers - Infinite API requires proper headers
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Origin", "https://infinite.tcgplayer.com")
	req.Header.Set("Referer", "https://infinite.tcgplayer.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
	}

	var priceResp PriceHistoryResponse
	if err := json.NewDecoder(resp.Body).Decode(&priceResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &priceResp, nil
}

// GetSalesWithFilters fetches sales with specific filters
// Useful for getting only specific conditions/variants/languages
func (c *Client) GetSalesWithFilters(productID int, conditions, languages, variants []string) ([]Sale, error) {
	var allSales []Sale
	offset := 0
	limit := 25 // API caps at 25 per request

	baseURL := fmt.Sprintf("https://mpapi.tcgplayer.com/v2/product/%d/latestsales?mpfev=4528", productID)

	for {
		reqBody := SalesRequest{
			Conditions:  conditions,
			Languages:   languages,
			Variants:    variants,
			ListingType: "All",
			Offset:      offset,
			Limit:       limit,
			Time:        time.Now().UnixMilli(),
		}

		bodyJSON, err := json.Marshal(reqBody)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request: %w", err)
		}

		bodyBase64 := base64.StdEncoding.EncodeToString(bodyJSON)

		req, err := http.NewRequest("POST", baseURL, bytes.NewBufferString(bodyBase64))
		if err != nil {
			return nil, fmt.Errorf("failed to create request: %w", err)
		}

		// Build cookie header from client's cookies
		cookieHeader := ""
		if c.cookies != nil {
			cookieHeader = BuildCookieHeader(c.cookies)
		}
		req.Header = SalesHeaders(cookieHeader)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to execute request: %w", err)
		}

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(body))
		}

		var salesResp PaginatedSalesResponse
		if err := json.NewDecoder(resp.Body).Decode(&salesResp); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("failed to decode response: %w", err)
		}
		resp.Body.Close()

		allSales = append(allSales, salesResp.Data...)

		if salesResp.NextPage == "No" {
			break
		}

		offset += limit
		time.Sleep(500 * time.Millisecond)
	}

	return allSales, nil
}
