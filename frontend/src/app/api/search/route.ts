import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const result = await pool.query(
      `SELECT DISTINCT
        p.product_id,
        p.card_name,
        p.set_code,
        p.set_name,
        p.rarity,
        (SELECT market_price FROM market_snapshots ms
         WHERE ms.product_id = p.product_id
         ORDER BY ms.time DESC LIMIT 1) as latest_price
      FROM printings p
      WHERE p.card_name ILIKE $1
      ORDER BY p.card_name, p.set_name
      LIMIT 50`,
      [`%${query}%`]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
