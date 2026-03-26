package ygoprodeck

import (
	"regexp"
	"strconv"
)

// ExtractDeckIDs parses HTML and extracts deck IDs from tournament page
// Looks for patterns like: href="/deck/k9-vanquish-soul-668241"
func ExtractDeckIDs(html []byte) []int {
	// Regular expression to match deck URLs with IDs
	// Pattern: /deck/.*-(\d+)
	re := regexp.MustCompile(`/deck/[^"]*-(\d+)`)
	matches := re.FindAllSubmatch(html, -1)

	// Use a map to avoid duplicates
	deckIDMap := make(map[int]bool)
	var deckIDs []int

	for _, match := range matches {
		if len(match) > 1 {
			if id, err := strconv.Atoi(string(match[1])); err == nil {
				if !deckIDMap[id] {
					deckIDMap[id] = true
					deckIDs = append(deckIDs, id)
				}
			}
		}
	}

	return deckIDs
}
