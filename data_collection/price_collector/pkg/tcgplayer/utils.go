package tcgplayer

// CalculateAverageSalePrice calculates weighted average from recent sales
func CalculateAverageSalePrice(sales []Sale) float64 {
	if len(sales) == 0 {
		return 0
	}

	total := 0.0
	weightSum := 0.0

	// Weight recent sales more heavily
	for i, sale := range sales {
		weight := 1.0 / float64(i+1) // First sale gets weight 1.0, second gets 0.5, etc.
		total += sale.PurchasePrice * weight
		weightSum += weight
	}

	if weightSum == 0 {
		return 0
	}

	return total / weightSum
}
