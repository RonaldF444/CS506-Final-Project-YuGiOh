package ygoprodeck

import "net/http"

// TournamentListHeaders returns headers for tournament list API requests
func TournamentListHeaders() http.Header {
	return http.Header{
		"User-Agent":       {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"},
		"Accept":           {"application/json, text/javascript, */*; q=0.01"},
		"X-Requested-With": {"XMLHttpRequest"},
		"Referer":          {"https://ygoprodeck.com/tournaments/"},
	}
}

// TournamentDetailsHeaders returns headers for tournament details page requests
func TournamentDetailsHeaders() http.Header {
	return http.Header{
		"User-Agent":                {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"},
		"Accept":                    {"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"},
		"Accept-Language":           {"en-US,en;q=0.9"},
		"Accept-Encoding":           {"gzip, deflate, br"},
		"Referer":                   {"https://ygoprodeck.com/tournaments/"},
		"sec-ch-ua":                 {`"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"`},
		"sec-ch-ua-mobile":          {"?0"},
		"sec-ch-ua-platform":        {`"Windows"`},
		"sec-fetch-dest":            {"document"},
		"sec-fetch-mode":            {"navigate"},
		"sec-fetch-site":            {"same-origin"},
		"sec-fetch-user":            {"?1"},
		"upgrade-insecure-requests": {"1"},
	}
}

// DeckInfoHeaders returns headers for deck info API requests
func DeckInfoHeaders() http.Header {
	return http.Header{
		"User-Agent":         {"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"},
		"Accept":             {"*/*"},
		"Accept-Language":    {"en-US,en;q=0.9"},
		"Accept-Encoding":    {"gzip, deflate, br"},
		"Referer":            {"https://ygoprodeck.com/tournaments/"},
		"sec-ch-ua":          {`"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"`},
		"sec-ch-ua-mobile":   {"?0"},
		"sec-ch-ua-platform": {`"Windows"`},
		"sec-fetch-dest":     {"empty"},
		"sec-fetch-mode":     {"cors"},
		"sec-fetch-site":     {"same-origin"},
	}
}
