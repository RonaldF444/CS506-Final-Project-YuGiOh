import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const strategy = request.nextUrl.searchParams.get('strategy') || '150d';

  try {
    // Get starting cash
    const portfolioResult = await pool.query(
      `SELECT starting_cash FROM paper_portfolio WHERE strategy_id = $1`,
      [strategy]
    );

    if (portfolioResult.rows.length === 0) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const startingCash = parseFloat(portfolioResult.rows[0].starting_cash);

    // This gives us realized P&L over time
    const tradesResult = await pool.query(
      `SELECT
         to_char(sold_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as sold_time,
         to_char(bought_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as bought_time,
         card_name,
         buy_price,
         sell_price,
         quantity,
         profit,
         fees
       FROM paper_positions
       WHERE strategy_id = $1 AND status = 'sold' AND sold_at IS NOT NULL
       ORDER BY sold_at ASC`,
      [strategy]
    );

    if (tradesResult.rows.length === 0) {
      return NextResponse.json({
        startingCash,
        timeline: [],
      });
    }

    // Track cash and holdings value over time.
    let cash = startingCash;

    const openPositions = new Map<number, number>(); // position_id -> cost

    const eventsResult = await pool.query(
      `SELECT
         to_char(tournament_date AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time,
         id, buy_price, quantity, 'BUY' as action, 0::numeric as profit
       FROM paper_positions
       WHERE strategy_id = $1
       UNION ALL
       SELECT
         to_char(sold_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as time,
         id, buy_price, quantity, 'SELL' as action,
         COALESCE(profit, 0) as profit
       FROM paper_positions
       WHERE strategy_id = $1 AND status = 'sold' AND sold_at IS NOT NULL
       ORDER BY time ASC, action ASC`,
      [strategy]
    );

    const timeline: { time: string; cash: number; holdings: number; totalValue: number }[] = [];

    // Starting point: day before first event
    if (eventsResult.rows.length > 0) {
      const firstDate = new Date(eventsResult.rows[0].time);
      firstDate.setDate(firstDate.getDate() - 1);
      timeline.push({
        time: firstDate.toISOString(),
        cash: startingCash,
        holdings: 0,
        totalValue: startingCash,
      });
    }

    for (const row of eventsResult.rows) {
      const posId = parseInt(row.id);
      const cost = parseFloat(row.buy_price) * parseInt(row.quantity);

      if (row.action === 'BUY') {
        cash -= cost;
        openPositions.set(posId, cost);
      } else {
        const profit = parseFloat(row.profit);
        cash += cost + profit;
        openPositions.delete(posId);
      }

      // Holdings = sum of cost basis of all currently open positions
      let holdings = 0;
      for (const c of openPositions.values()) {
        holdings += c;
      }

      timeline.push({
        time: row.time,
        cash,
        holdings,
        totalValue: cash + holdings,
      });
    }

    return NextResponse.json({
      startingCash,
      timeline,
    });
  } catch (error) {
    console.error('Trading history API error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
