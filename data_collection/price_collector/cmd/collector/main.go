package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/database"
	"github.com/CardzTsar/tcgPlayer-Monitor/pkg/tcgplayer"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env file (ignore error if it doesn't exist)
	godotenv.Load()

	// Get configuration from environment
	dbHost := os.Getenv("DB_HOST")
	dbPort := 5432
	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASS")
	dbName := os.Getenv("DB_NAME")

	// Connect to database
	log.Printf("Connecting to database %s@%s:%d/%s...\n", dbUser, dbHost, dbPort, dbName)
	db, err := database.NewDB(database.Config{
		Host:     dbHost,
		Port:     dbPort,
		User:     dbUser,
		Password: dbPass,
		DBName:   dbName,
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()
	log.Println("Database connected")

	// Create monitor manager
	manager := tcgplayer.NewManager(db)
	if err := manager.Start(); err != nil {
		log.Fatalf("Failed to start monitor manager: %v", err)
	}

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	log.Println("CardzTzar collector started")
	log.Println("Press Ctrl+C to stop")

	// Wait for shutdown signal
	<-sigCh

	log.Println("\nShutdown signal received...")
	manager.Stop()
	log.Println("Shutdown completed")
}
