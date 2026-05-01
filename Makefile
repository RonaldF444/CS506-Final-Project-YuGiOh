.PHONY: install train train-sell paper-trade test viz clean

# Install Python dependencies
install:
	python3 -m pip install -r requirements.txt

# Train the XGBoost buy model (requires PostgreSQL database connection)
train:
	python3 main.py

# Train the XGBoost sell-timing model (requires buy model + DB)
train-sell:
	python3 scripts/train_sell_model.py

# Replay paper trader with quarterly retraining (buy + sell)
paper-trade:
	python3 scripts/run_paper_trader.py --strategy-id default --top-n-per-tournament 1 --reset

# Run tests
test:
	python3 -m pytest tests/ -v

# Import card data from YGOProDeck API into database
import-cards:
	python3 scripts/import_cards.py

# Generate visualizations from model output
viz:
	python3 visualization/generate_plots.py

# Generate EDA plots (requires database connection)
eda:
	python3 visualization/generate_eda_plots.py

# Clean Python cache files
clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
