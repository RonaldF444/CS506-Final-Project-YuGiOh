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
SELL_MODEL_PATH = 'models/sell_model.joblib'
ML_SUMMARY_PATH = 'models/ml_summary.json'
CS506_REPORT_PATH = 'models/cs506_report.json'
CLUSTER_EXPLORATION_PATH = 'models/cluster_exploration.json'
N_CLUSTERS = 5
RANDOM_STATE = 42
MIN_CARD_APPEARANCES = 10
MIN_CARD_PRICE = 8.00

# TCGPlayer Level 1-4 Marketplace Seller fees
SELLER_COMMISSION_PCT = 0.1075
TRANSACTION_FEE_PCT = 0.025
TRANSACTION_FEE_FLAT = 0.30

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

SELL_FEATURES = [
    'peak_gain_pct',
    'drawdown_from_peak_pct',
    'days_held',
    'days_remaining',
    'hold_pct_elapsed',
    'price_momentum_3d',
    'price_momentum_7d',
    'volatility_since_buy',
    'predicted_change_pct',
    'days_since_last_new_high',
]
