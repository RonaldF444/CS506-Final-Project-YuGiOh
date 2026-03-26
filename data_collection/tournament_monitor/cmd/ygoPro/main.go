package main

import (
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/CardzTsar/Tournamet-results-monitor/pkg/database"
	"github.com/CardzTsar/Tournamet-results-monitor/pkg/ygoprodeck"

	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Get database configuration from environment
	dbPort, _ := strconv.Atoi(getEnv("DB_PORT", "5432"))
	dbConfig := database.Config{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     dbPort,
		User:     getEnv("DB_USER", "postgres"),
		Password: getEnv("DB_PASS", ""),
		DBName:   getEnv("DB_NAME", "cardztzar"),
	}

	// Connect to database
	db, err := database.NewDB(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Database connected")

	// Create and start monitor
	monitor := ygoprodeck.NewMonitor(db)
	monitor.Start()
	log.Println("Tournament monitor started")

	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
	<-sigChan

	// Stop monitor
	log.Println("Stopping monitor...")
	monitor.Stop()

	// Print final statistics
	stats := monitor.GetStats()
	activeTournaments := monitor.GetActiveTournamentMonitors()
	log.Printf("Final Statistics:")
	log.Printf("Collections run: %d", stats.CollectionCount)
	log.Printf("New tournaments discovered: %d", stats.NewTournamentCount)
	log.Printf("Tournament monitors active: %d", activeTournaments)
	log.Printf("Errors encountered: %d", stats.ErrorCount)

	log.Println("Shutdown complete")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}