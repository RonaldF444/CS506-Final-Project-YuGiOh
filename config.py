import os
from dotenv import load_dotenv

load_dotenv()

# Database config (same DB for all tables)
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASS', ''),
    'dbname': os.getenv('DB_NAME', 'cardtzar'),
}

# Prediction config
PREDICTION_HORIZON_DAYS = 7  # Predict price 7 days out
UP_THRESHOLD = 0.05          # >5% = "up"
DOWN_THRESHOLD = -0.05       # <-5% = "down"

# Feature lookback windows (days)
LOOKBACK_WINDOWS = [7, 14, 30, 60]

# Model config
MODEL_PATH = 'models/price_predictor.joblib'
ML_SUMMARY_PATH = 'models/ml_summary.json'
CS506_REPORT_PATH = 'models/cs506_report.json'
CLUSTER_EXPLORATION_PATH = 'models/cluster_exploration.json'
N_CLUSTERS = 5
RANDOM_STATE = 42
TEST_SIZE = 0.2
MIN_CARD_APPEARANCES = 10  # Minimum tournament appearances required to include a card (reduces noise)

# Data filtering
MIN_CARD_PRICE = 3.00               # Skip cards under this price (too noisy / illiquid)

# Feature columns for the model
FEATURES = [
    'price_at_tournament',
    'price_tier',
    'price_volatility_7d',
    'momentum_1d',
    'momentum_3d',
    'momentum_7d',
    'avg_prior_price_change',
    'num_printings',
    'card_tournament_count',
    'top_cut_rate',
    'log_player_count',
]

# Features used to build per-card profiles for clustering
CLUSTER_FEATURES = [
    'price_at_tournament', 'price_volatility_7d', 'num_printings',
    'card_tournament_count', 'top_cut_rate', 'avg_prior_price_change',
]