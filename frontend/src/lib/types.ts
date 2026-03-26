export interface Card {
  product_id: number;
  card_name: string;
  set_code: string;
  set_name: string;
  rarity: string;
}

export interface PricePoint {
  time: string;
  market_price: number;
  lowest_price: number;
  median_price: number;
  total_listings: number;
}

export interface Sale {
  product_id: number;
  order_date: string;
  condition: string;
  variant: string;
  language: string;
  quantity: number;
  purchase_price: number;
  shipping_price: number;
}

export interface SearchResult {
  product_id: number;
  card_name: string;
  set_code: string;
  set_name: string;
  rarity: string;
  latest_price: number | null;
}

// Debug types
export interface FailedMapping {
  ygoprodeck_id: number;
  card_name: string;
  set_code: string | null;
  mapping_confidence: number | null;
  updated_at: string;
}

export interface UnprocessedDeck {
  id: number;
  tournament_id: number;
  player_name: string;
  created_at: string;
}

export interface BackfillJob {
  id: number;
  status: string;
  triggered_by: string;
  products_processed: number;
  products_total: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface WatchSource {
  added_by: string;
  count: number;
  active: number;
}

// ML Analytics types
export interface MLSummary {
  training_date: string;
  training_rows: number;
  model_type: string;
  mean_price_change: number;
  median_price_change: number;
  price_change_std: number;
  date_ranges: {
    train: [string, string];
    val: [string, string];
    test: [string, string];
  };
  metrics: {
    train: MLMetricSet;
    val: MLMetricSet;
    test: MLMetricSet;
  };
  feature_importance: MLFeatureImportance[];
  top_price_change_cards: MLPriceChangeCard[];
  overfitting: { detected: boolean; r2_gap: number };
}

export interface MLMetricSet {
  rmse: number;
  mae: number;
  r2: number;
}

export interface MLFeatureImportance {
  feature: string;
  importance: number;
}

export interface MLPriceChangeCard {
  card_name: string;
  mean_price_change: number;
  appearances: number;
}

export interface TournamentPriceData {
  event_date: string;
  tournament_name: string;
  prices: { time: string; market_price: number }[];
}

export interface MarketIndexPoint {
  day: string;
  overall: number;
  budget: number | null;
  mid: number | null;
  premium: number | null;
  num_products: number;
}

// CS 506 Report types
export interface CS506Report {
  generated_date: string;
  target_distribution: TargetDistribution;
  predicted_vs_actual: PredictedVsActual;
  backtest: BacktestSummary;
  feature_importance: MLFeatureImportance[];
  model_info: ModelInfo;
}

export interface HistogramBin {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface TargetDistribution {
  bins: HistogramBin[];
  total_samples: number;
  split: string;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
}

export interface PredictionPoint {
  predicted: number;
  actual: number;
}

export interface PredictedVsActual {
  points: PredictionPoint[];
  split: string;
  count: number;
  r2: number;
  rmse: number;
  spearman: number;
  perfect_line: { min: number; max: number };
}

export interface RankResult {
  top_n: number;
  trades: number;
  avg_actual_change: number;
  edge_vs_baseline: number;
  zero_fee_roi: number;
  with_fee_roi: number;
  win_rate: number;
}

export interface BacktestSummary {
  n_tournaments: number;
  eligible_cards: number;
  avg_actual_change: number;
  min_card_price: number;
  fee_config: {
    commission_pct: number;
    transaction_fee_pct: number;
    flat_fee: number;
  };
  rank_results: RankResult[];
  random_baseline: {
    roi: number;
    std: number;
    n_trials: number;
  };
}

export interface ModelInfo {
  model_type: string;
  n_estimators: number;
  max_depth: number;
  learning_rate: number;
  training_rows: number;
  n_features: number;
  date_ranges: {
    train: [string, string];
    val: [string, string];
    test: [string, string];
  };
  metrics: {
    train: MLMetricSet;
    val: MLMetricSet;
    test: MLMetricSet;
  };
}

// Clustering exploration types
export interface CardProfile {
  card_name: string;
  price_at_tournament: number;
  price_volatility_7d: number;
  num_printings: number;
  card_tournament_count: number;
  top_cut_rate: number;
  avg_prior_price_change: number;
  cluster?: number;
}

export interface ElbowPoint {
  k: number;
  inertia: number;
}

export interface ClusterProfile {
  cluster: number;
  count: number;
  price_at_tournament: number;
  price_volatility_7d: number;
  num_printings: number;
  card_tournament_count: number;
  top_cut_rate: number;
  avg_prior_price_change: number;
}

export interface FeatureStat {
  min: number;
  max: number;
  mean: number;
  std: number;
}

export interface ClusterExploration {
  cards: CardProfile[];
  features: string[];
  feature_stats: Record<string, FeatureStat>;
  total_cards: number;
  generated_date: string;
  n_clusters?: number;
  elbow_data?: ElbowPoint[];
  cluster_profiles?: ClusterProfile[];
}

export interface HistoryCoverage {
  product_id: number;
  card_name: string;
  set_code: string;
  earliest_market_date: string | null;
  latest_market_date: string | null;
  market_days_with_data: number | null;
  market_days_missing: number | null;
  market_total_days_expected: number | null;
  earliest_sale_date: string | null;
  latest_sale_date: string | null;
  sales_days_with_data: number | null;
  total_sales: number | null;
  sales_days_missing: number | null;
  sales_total_days_expected: number | null;
}
