import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') || '90';
  const days = Math.min(Math.max(parseInt(range) || 90, 7), 365);

  try {
    const result = await pool.query(
      `SELECT
        DATE(ms.time)::text as day,
        AVG(ms.market_price) as avg_price,
        COUNT(DISTINCT ms.product_id) as num_products,
        AVG(CASE WHEN ms.market_price >= 1 AND ms.market_price < 5 THEN ms.market_price END) as budget_avg,
        AVG(CASE WHEN ms.market_price >= 5 AND ms.market_price < 20 THEN ms.market_price END) as mid_avg,
        AVG(CASE WHEN ms.market_price >= 20 THEN ms.market_price END) as premium_avg
      FROM market_snapshots ms
      WHERE ms.time >= CURRENT_DATE - $1::int * INTERVAL '1 day'
        AND ms.market_price >= 1.0
      GROUP BY DATE(ms.time)
      HAVING COUNT(DISTINCT ms.product_id) >= 20
      ORDER BY day`,
      [days]
    );

    if (result.rows.length === 0) {
      return NextResponse.json([]);
    }

    const first = result.rows[0];
    const data = result.rows.map((row: Record<string, number | string | null>) => ({
      day: row.day,
      overall: Number(((Number(row.avg_price) / Number(first.avg_price)) * 100).toFixed(2)),
      budget: first.budget_avg && row.budget_avg
        ? Number(((Number(row.budget_avg) / Number(first.budget_avg)) * 100).toFixed(2))
        : null,
      mid: first.mid_avg && row.mid_avg
        ? Number(((Number(row.mid_avg) / Number(first.mid_avg)) * 100).toFixed(2))
        : null,
      premium: first.premium_avg && row.premium_avg
        ? Number(((Number(row.premium_avg) / Number(first.premium_avg)) * 100).toFixed(2))
        : null,
      num_products: Number(row.num_products),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error('Market index query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
