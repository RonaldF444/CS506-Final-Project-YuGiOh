package ygoprodeck

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/andybalholm/brotli"
)

// NewClient creates a new YGOProDeck API client
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		baseURL: "https://ygoprodeck.com/api/tournament",
	}
}

// GetTournaments fetches all tournaments from YGOProDeck API
func (c *Client) GetTournaments() (*TournamentResponse, error) {
	// Add timestamp parameter to avoid caching
	url := fmt.Sprintf("%s/getTournaments.php?_=%d", c.baseURL, time.Now().UnixMilli())

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add headers to mimic browser request
	req.Header = TournamentListHeaders()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Return status code only, not full HTML body
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var result TournamentResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetTournamentDetails fetches HTML page for a specific tournament to extract deck IDs
func (c *Client) GetTournamentDetails(slug string) ([]byte, error) {
	url := fmt.Sprintf("https://ygoprodeck.com/tournament/%s", slug)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add all browser-like headers
	req.Header = TournamentDetailsHeaders()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Check for gzip magic bytes (0x1f 0x8b)
	if len(body) > 2 && body[0] == 0x1f && body[1] == 0x8b {
		gzipReader, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer gzipReader.Close()

		decompressed, err := io.ReadAll(gzipReader)
		if err != nil {
			return nil, fmt.Errorf("failed to decompress gzip: %w", err)
		}
		return decompressed, nil
	}

	// Try brotli decompression (header says "br" in Accept-Encoding)
	if resp.Header.Get("Content-Encoding") == "br" ||
	   (len(body) > 0 && (body[0] == 0x5b || body[0] == 0x8b || body[0] == 0x1b)) {
		brReader := brotli.NewReader(bytes.NewReader(body))
		decompressed, err := io.ReadAll(brReader)
		if err == nil && len(decompressed) > len(body) {
			// Successfully decompressed and result is larger
			return decompressed, nil
		}
		// If brotli fails, continue with original body
	}

	return body, nil
}

// GetDeckInfo fetches deck profile information by deck ID
func (c *Client) GetDeckInfo(deckID int) (*DeckInfoResponse, error) {
	url := fmt.Sprintf("https://ygoprodeck.com/api/decks/getDeckInfo.php?deckId=%d", deckID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add all browser-like headers to avoid Cloudflare blocking
	req.Header = DeckInfoHeaders()

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Return status code only, not full HTML body
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	// Decompress if needed (same logic as GetTournamentDetails)
	decompressed := body

	// Check for gzip
	if len(body) > 2 && body[0] == 0x1f && body[1] == 0x8b {
		gzipReader, err := gzip.NewReader(bytes.NewReader(body))
		if err != nil {
			return nil, fmt.Errorf("failed to create gzip reader: %w", err)
		}
		defer gzipReader.Close()

		decompressed, err = io.ReadAll(gzipReader)
		if err != nil {
			return nil, fmt.Errorf("failed to decompress gzip: %w", err)
		}
	} else if resp.Header.Get("Content-Encoding") == "br" ||
	          (len(body) > 0 && (body[0] == 0x5b || body[0] == 0x8b || body[0] == 0x1b)) {
		// Try brotli decompression
		brReader := brotli.NewReader(bytes.NewReader(body))
		temp, err := io.ReadAll(brReader)
		if err == nil && len(temp) > len(body) {
			decompressed = temp
		}
	}

	var result DeckInfoResponse
	if err := json.Unmarshal(decompressed, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &result, nil
}

// GetCardInfo fetches card information by YGOProDeck card ID
func (c *Client) GetCardInfo(cardID int) (*CardData, error) {
	url := fmt.Sprintf("https://db.ygoprodeck.com/api/v7/cardinfo.php?id=%d", cardID)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	var result CardInfoResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("card not found: %d", cardID)
	}

	return &result.Data[0], nil
}
