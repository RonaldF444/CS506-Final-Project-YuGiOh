import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(
      `WITH watched AS (
        SELECT wp.product_id, wp.card_name, wp.set_code
        FROM watched_printings wp
        WHERE wp.is_active = true
      ),
      market_stats AS (
        SELECT
          product_id,
          MIN(time::date) as earliest_market_date,
          MAX(time::date) as latest_market_date,
          COUNT(DISTINCT time::date) as market_days_with_data
        FROM market_snapshots
        GROUP BY product_id
      ),
      sales_stats AS (
        SELECT
          product_id,
          MIN(order_date::date) as earliest_sale_date,
          MAX(order_date::date) as latest_sale_date,
          COUNT(DISTINCT order_date::date) as sales_days_with_data,
          COUNT(*) as total_sales
        FROM sales
        GROUP BY product_id
      )
      SELECT
        w.product_id,
        w.card_name,
        w.set_code,
        ms.earliest_market_date,
        ms.latest_market_date,
        ms.market_days_with_data,
        CASE
          WHEN ms.earliest_market_date IS NOT NULL
          THEN (CURRENT_DATE - ms.earliest_market_date + 1) - ms.market_days_with_data
          ELSE NULL
        END as market_days_missing,
        CASE
          WHEN ms.earliest_market_date IS NOT NULL
          THEN (CURRENT_DATE - ms.earliest_market_date + 1)
          ELSE NULL
        END as market_total_days_expected,
        ss.earliest_sale_date,
        ss.latest_sale_date,
        ss.sales_days_with_data,
        ss.total_sales,
        CASE
          WHEN ss.earliest_sale_date IS NOT NULL
          THEN (CURRENT_DATE - ss.earliest_sale_date + 1) - ss.sales_days_with_data
          ELSE NULL
        END as sales_days_missing,
        CASE
          WHEN ss.earliest_sale_date IS NOT NULL
          THEN (CURRENT_DATE - ss.earliest_sale_date + 1)
          ELSE NULL
        END as sales_total_days_expected
      FROM watched w
      LEFT JOIN market_stats ms ON w.product_id = ms.product_id
      LEFT JOIN sales_stats ss ON w.product_id = ss.product_id
      ORDER BY w.card_name`
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('History coverage query error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
