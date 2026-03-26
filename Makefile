.PHONY: install train test viz clean

# Install Python dependencies
install:
	python3 -m pip install -r requirements.txt

# Train the XGBoost model (requires PostgreSQL database connection)
train:
	python3 main.py

# Run tests
test:
	python3 -m pytest tests/ -v

# Import card data from YGOProDeck API into database
import-cards:
	python3 scripts/import_cards.py

# Generate visualizations from model output
viz:
	python3 visualization/generate_plots.py

# Clean Python cache files
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
