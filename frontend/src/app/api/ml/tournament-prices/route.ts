import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const cardName = request.nextUrl.searchParams.get('card_name');

  if (!cardName) {
    return NextResponse.json({ error: 'card_name parameter required' }, { status: 400 });
  }

  try {
    const result = await pool.query(
      `WITH card_tournaments AS (
        SELECT DISTINCT t.id, t.event_date, t.name as tournament_name
        FROM tournaments t
        JOIN deck_profiles dp ON dp.tournament_id = t.id
        JOIN cards c ON c.id::text IN (
          SELECT value::text FROM jsonb_array_elements_text(dp.main_deck)
          UNION ALL
          SELECT value::text FROM jsonb_array_elements_text(dp.extra_deck)
          UNION ALL
          SELECT value::text FROM jsonb_array_elements_text(dp.side_deck)
        )
        WHERE c.name = $1 AND t.format = 'TCG' AND t.player_count > 0
        ORDER BY t.event_date DESC
        LIMIT 5
      )
      SELECT
        ct.event_date,
        ct.tournament_name,
        json_agg(
          json_build_object('time', ms.time, 'market_price', ms.market_price)
          ORDER BY ms.time
        ) as prices
      FROM card_tournaments ct
      JOIN printings p ON p.card_name = $1
      JOIN market_snapshots ms ON ms.product_id = p.product_id
        AND ms.time BETWEEN ct.event_date - interval '7 days' AND ct.event_date + interval '7 days'
      GROUP BY ct.id, ct.event_date, ct.tournament_name
      ORDER BY ct.event_date DESC`,
      [cardName]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Tournament prices error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
