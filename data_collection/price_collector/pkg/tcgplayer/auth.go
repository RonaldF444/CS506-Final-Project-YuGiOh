package tcgplayer

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
)

// Login authenticates with TCGPlayer and returns cookies
func Login(username, password string) (map[string]string, error) {
	// Create client with cookie jar to store cookies
	jar, _ := cookiejar.New(nil)
	client := &http.Client{
		Jar: jar,
	}

	// Build login request
	loginURL := "https://mpapi.tcgplayer.com/v3/login/signin?mpfev=4528"

	loginBody := map[string]string{
		"email":    username,
		"password": password,
	}

	bodyJSON, err := json.Marshal(loginBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal login body: %w", err)
	}

	// Debug: log request body (without password)
	loginBodyDebug := map[string]string{
		"email":    username,
		"password": "[REDACTED]",
	}
	debugJSON, _ := json.Marshal(loginBodyDebug)
	fmt.Printf("DEBUG: Request URL: %s\n", loginURL)
	fmt.Printf("DEBUG: Request body: %s\n", string(debugJSON))

	req, err := http.NewRequest("POST", loginURL, bytes.NewBuffer(bodyJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers to look like browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://www.tcgplayer.com")
	req.Header.Set("Referer", "https://www.tcgplayer.com/login")
	req.Header.Set("sec-ch-ua-platform", "\"Windows\"")
	req.Header.Set("sec-ch-ua", "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"")
	req.Header.Set("sec-ch-ua-mobile", "?0")
	req.Header.Set("sec-fetch-site", "same-site")
	req.Header.Set("sec-fetch-mode", "cors")
	req.Header.Set("sec-fetch-dest", "empty")

	// Execute login request
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("login request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check response
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		fmt.Printf("DEBUG: Response status: %d\n", resp.StatusCode)
		fmt.Printf("DEBUG: Response headers: %v\n", resp.Header)
		fmt.Printf("DEBUG: Response body: %s\n", string(body))
		return nil, fmt.Errorf("login failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var loginResp LoginResponse
	if err := json.NewDecoder(resp.Body).Decode(&loginResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if loginResp.LoginResult != "Redirect" {
		return nil, fmt.Errorf("unexpected login result: %s", loginResp.LoginResult)
	}

	// Extract cookies from cookie jar
	u, _ := url.Parse("https://mpapi.tcgplayer.com")
	cookies := jar.Cookies(u)

	cookieMap := make(map[string]string)
	for _, cookie := range cookies {
		cookieMap[cookie.Name] = cookie.Value
	}

	// Verify we got the auth ticket
	if _, ok := cookieMap["TCGAuthTicket_Production"]; !ok {
		return nil, fmt.Errorf("login succeeded but TCGAuthTicket_Production not found")
	}

	return cookieMap, nil
}

// BuildCookieHeader builds Cookie header string from map
func BuildCookieHeader(cookies map[string]string) string {
	var parts []string
	for key, val := range cookies {
		parts = append(parts, fmt.Sprintf("%s=%s", key, val))
	}
	return strings.Join(parts, "; ")
}

// SaveCookies saves cookies to a JSON file
func SaveCookies(cookies map[string]string, filename string) error {
	file, err := os.Create(filename)
	if err != nil {
		return err
	}
	defer file.Close()

	return json.NewEncoder(file).Encode(cookies)
}

// LoadCookies loads cookies from a JSON file
func LoadCookies(filename string) (map[string]string, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var cookies map[string]string
	err = json.NewDecoder(file).Decode(&cookies)
	return cookies, err
}
