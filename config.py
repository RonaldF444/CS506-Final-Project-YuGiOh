import os
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASS', ''),
    'dbname': os.getenv('DB_NAME', 'cardtzar'),
}

MODEL_PATH = 'models/price_predictor.joblib'
ML_SUMMARY_PATH = 'models/ml_summary.json'
CS506_REPORT_PATH = 'models/cs506_report.json'
CLUSTER_EXPLORATION_PATH = 'models/cluster_exploration.json'
N_CLUSTERS = 5
RANDOM_STATE = 42
MIN_CARD_APPEARANCES = 10
MIN_CARD_PRICE = 3.00

FEATURES = [
    'price_at_tournament',
    'price_tier',
    'price_volatility_7d',
    'momentum_1d',
    'momentum_3d',
    'momentum_7d',
    'momentum_30d',
    'momentum_90d',
    'distance_from_high',
    'is_new_high',
    'distance_from_30d_high',
    'is_new_30d_high',
    'distance_from_60d_high',
    'is_new_60d_high',
    'deck_trend',
    'archetype_avg_top_cut_rate',
    'archetype_momentum_7d',
    'is_monthly_data',
    'banlist_status',
    'is_banned',
    'days_since_ban_change',
    'deckmate_momentum_avg',
]

CLUSTER_FEATURES = [
    'price_at_tournament', 'price_volatility_7d', 'num_printings',
    'card_tournament_count', 'top_cut_rate', 'avg_prior_price_change',
]
