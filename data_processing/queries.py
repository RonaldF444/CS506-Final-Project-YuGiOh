"""SQL string constants for training and prediction queries.

BASE_CTES is shared by both training and prediction.
LATERAL_JOINS_TRAINING provides momentum price lookups (past data only).
LATERAL_JOIN_AFTER provides post-tournament price lookup (TRAINING ONLY - never use in prediction).
"""

# Shared CTE fragments used by both training and prediction queries
BASE_CTES = """
    WITH tcg_decks AS (
        SELECT dp.id as deck_profile_id, dp.tournament_id, dp.placement,
               dp.main_deck, dp.extra_deck, dp.side_deck
        FROM deck_profiles dp
        JOIN tournaments t ON t.id = dp.tournament_id
        WHERE t.format = 'TCG' AND t.player_count > 0
    ),
    deck_card_entries AS (
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(main_deck::jsonb)
        UNION ALL
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(extra_deck::jsonb)
        UNION ALL
        SELECT deck_profile_id, tournament_id, placement, value::text::int as card_id
        FROM tcg_decks, jsonb_array_elements_text(side_deck::jsonb)
    ),
    tournament_card_appearances AS (
        SELECT
            t.id as tournament_id,
            t.event_date,
            t.player_count,
            t.name as tournament_name,
            c.id as card_id,
            c.name as card_name,
            COUNT(DISTINCT dce.deck_profile_id) as decks_with_card,
            MIN(dce.placement) as best_placement,
            COUNT(*) as total_copies
        FROM deck_card_entries dce
        JOIN tournaments t ON t.id = dce.tournament_id
        JOIN cards c ON c.id = dce.card_id
        GROUP BY t.id, t.event_date, t.player_count, t.name, c.id, c.name
    ),
    ranked_printings AS (
        SELECT p.card_name, p.product_id, p.rarity, p.set_code,
               ROW_NUMBER() OVER (
                   PARTITION BY p.card_name
                   ORDER BY snap_count DESC, p.product_id
               ) as rn
        FROM printings p
        LEFT JOIN LATERAL (
            SELECT COUNT(*) as snap_count
            FROM market_snapshots ms
            WHERE ms.product_id = p.product_id
        ) sc ON true
    ),
    printing_counts AS (
        SELECT card_name, COUNT(*) as num_printings
        FROM printings
        GROUP BY card_name
    )
"""

# Widened LATERAL JOINs for price snapshots
LATERAL_JOINS_TRAINING = """
    -- Price at tournament time (closest snapshot within -14 to +1 day)
    JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '14 days'
          AND time < tca.event_date + INTERVAL '1 day'
        ORDER BY ABS(EXTRACT(EPOCH FROM (time - tca.event_date))) LIMIT 1
    ) ms_at ON true

    -- 1-day momentum (snapshot 1-4 days before)
    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '4 days'
          AND time < tca.event_date - INTERVAL '0 days'
        ORDER BY time DESC LIMIT 1
    ) ms_1d ON true

    -- 3-day momentum (snapshot 1-7 days before)
    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '7 days'
          AND time < tca.event_date - INTERVAL '1 day'
        ORDER BY time DESC LIMIT 1
    ) ms_3d ON true

    -- 7-day momentum (snapshot 4-14 days before)
    LEFT JOIN LATERAL (
        SELECT market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date - INTERVAL '14 days'
          AND time < tca.event_date - INTERVAL '4 days'
        ORDER BY time DESC LIMIT 1
    ) ms_7d ON true
"""

LATERAL_JOIN_AFTER = """
    -- Peak price within 60 days after tournament (best sell opportunity)
    JOIN LATERAL (
        SELECT MAX(market_price) as market_price FROM market_snapshots
        WHERE product_id = p.product_id
          AND time >= tca.event_date + INTERVAL '1 day'
          AND time < tca.event_date + INTERVAL '60 days'
    ) ms_after ON true
"""
