package tcgplayer

import "net/http"

// SearchHeaders returns headers for search API requests
func SearchHeaders() http.Header {
	return http.Header{
		"Content-Type":       {"application/json"},
		"Accept":             {"application/json, text/plain, */*"},
		"Origin":             {"https://www.tcgplayer.com"},
		"Referer":            {"https://www.tcgplayer.com/"},
		"User-Agent":         {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"},
		"sec-ch-ua":          {`"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"`},
		"sec-ch-ua-mobile":   {"?0"},
		"sec-ch-ua-platform": {`"Windows"`},
		"sec-fetch-site":     {"same-site"},
		"sec-fetch-mode":     {"cors"},
		"sec-fetch-dest":     {"empty"},
	}
}

// SalesHeaders returns headers for sales API requests
func SalesHeaders(cookieHeader string) http.Header {
	headers := http.Header{}
	headers.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36")
	headers.Set("Accept", "application/json, text/plain, */*")
	headers.Set("Content-Type", "application/json")
	headers.Set("Origin", "https://www.tcgplayer.com")
	headers.Set("Referer", "https://www.tcgplayer.com/")
	headers.Set("sec-ch-ua-platform", "\"Windows\"")
	headers.Set("sec-ch-ua", "\"Chromium\";v=\"142\", \"Google Chrome\";v=\"142\", \"Not_A Brand\";v=\"99\"")
	headers.Set("sec-ch-ua-mobile", "?0")
	headers.Set("sec-fetch-site", "same-site")
	headers.Set("sec-fetch-mode", "cors")
	headers.Set("sec-fetch-dest", "empty")
	headers.Set("accept-language", "en-US,en;q=0.9")
	headers.Set("priority", "u=1, i")

	// Add cookies if provided
	if cookieHeader != "" {
		headers.Set("Cookie", cookieHeader)
	}

	return headers
}

// ProductDetailsHeaders returns headers for product details API requests
func ProductDetailsHeaders() http.Header {
	return http.Header{
		"Accept":     {"application/json"},
		"Origin":     {"https://www.tcgplayer.com"},
		"Referer":    {"https://www.tcgplayer.com/"},
		"User-Agent": {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
	}
}
