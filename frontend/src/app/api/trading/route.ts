import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request: NextRequest) {
  const strategy = request.nextUrl.searchParams.get('strategy') || 'default';

  try {
    // Portfolio summary
    const portfolioResult = await pool.query(
      `SELECT starting_cash, current_cash, hold_days
       FROM paper_portfolio WHERE strategy_id = $1`,
      [strategy]
    );

    if (portfolioResult.rows.length === 0) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const portfolio = portfolioResult.rows[0];

    // Current simulation date = max(latest buy, latest sell) across this strategy
    const simDateResult = await pool.query(
      `SELECT GREATEST(
         (SELECT MAX(tournament_date) FROM paper_positions WHERE strategy_id = $1),
         (SELECT MAX(sold_at::date) FROM paper_positions WHERE strategy_id = $1 AND sold_at IS NOT NULL)
       ) as sim_date`,
      [strategy]
    );
    const simDate = simDateResult.rows[0]?.sim_date || null;

    // Open positions with current prices (as of sim date, not real-world today)
    const openResult = await pool.query(
      `SELECT pp.id, pp.card_name, pp.product_id, pp.buy_price, pp.predicted_change_pct,
              pp.prediction_std_pct, pp.confidence, pp.quantity, pp.tournament_date, pp.expiry_date, pp.bought_at,
              pr.set_code, pr.rarity,
              (SELECT market_price FROM market_snapshots
               WHERE product_id = pp.product_id
                 AND ($2::date IS NULL OR time::date <= $2::date)
               ORDER BY time DESC LIMIT 1) as current_price
       FROM paper_positions pp
       LEFT JOIN printings pr ON pr.product_id = pp.product_id
       WHERE pp.strategy_id = $1 AND pp.status = 'open'
       ORDER BY pp.bought_at DESC`,
      [strategy, simDate]
    );

    // Closed positions
    const closedResult = await pool.query(
      `SELECT pp.id, pp.card_name, pp.product_id, pp.buy_price, pp.sell_price,
              pp.predicted_change_pct, pp.confidence, pp.quantity, pp.profit, pp.fees,
              pp.sell_reason, pp.tournament_date, pp.sold_at,
              pr.set_code, pr.rarity,
              (SELECT market_price FROM market_snapshots
               WHERE product_id = pp.product_id
                 AND time::date >= pp.tournament_date
                 AND time::date <= pp.sold_at::date
               ORDER BY market_price DESC LIMIT 1) as peak_during_hold,
              (SELECT to_char(time::date, 'YYYY-MM-DD') FROM market_snapshots
               WHERE product_id = pp.product_id
                 AND time::date >= pp.tournament_date
                 AND time::date <= pp.sold_at::date
               ORDER BY market_price DESC, time ASC LIMIT 1) as peak_during_hold_date,
              (SELECT market_price FROM market_snapshots
               WHERE product_id = pp.product_id
                 AND time::date > pp.sold_at::date
               ORDER BY market_price DESC LIMIT 1) as peak_after_sell,
              (SELECT to_char(time::date, 'YYYY-MM-DD') FROM market_snapshots
               WHERE product_id = pp.product_id
                 AND time::date > pp.sold_at::date
               ORDER BY market_price DESC, time ASC LIMIT 1) as peak_after_sell_date
       FROM paper_positions pp
       LEFT JOIN printings pr ON pr.product_id = pp.product_id
       WHERE pp.strategy_id = $1 AND pp.status = 'sold'
       ORDER BY pp.sold_at DESC`,
      [strategy]
    );

    // Compute summary stats
    const open = openResult.rows;
    const closed = closedResult.rows;

    const startingCash = parseFloat(portfolio.starting_cash);

    // TCGPlayer fee constants (match config.py)
    const SELLER_COMMISSION_PCT = 0.1075;
    const TRANSACTION_FEE_PCT = 0.025;
    const TRANSACTION_FEE_FLAT = 0.30;

    const netSellAfterFees = (price: number, qty: number) => {
      const gross = price * qty;
      const fees = gross * (SELLER_COMMISSION_PCT + TRANSACTION_FEE_PCT) + TRANSACTION_FEE_FLAT * qty;
      return gross - fees;
    };

    // marketValue = net-of-fees proceeds if all open positions were sold now
    let marketValue = 0;
    let unrealizedPnl = 0;
    let openCost = 0;
    for (const pos of open) {
      const currentPrice = pos.current_price ? parseFloat(pos.current_price) : parseFloat(pos.buy_price);
      const qty = parseInt(pos.quantity);
      const cost = parseFloat(pos.buy_price) * qty;
      const net = netSellAfterFees(currentPrice, qty);
      marketValue += net;
      unrealizedPnl += net - cost;
      openCost += cost;
    }

    const realizedPnl = closed.reduce((sum: number, t: { profit: string | null }) =>
      sum + (t.profit ? parseFloat(t.profit) : 0), 0);
    const wins = closed.filter((t: { profit: string | null }) => t.profit && parseFloat(t.profit) > 0).length;
    const losses = closed.filter((t: { profit: string | null }) => t.profit && parseFloat(t.profit) <= 0).length;

    // paper_portfolio.current_cash is not maintained by the replay script,
    // so derive cash and total value from realized P&L + open-position cost.
    const currentCash = startingCash + realizedPnl - openCost;
    const totalValue = currentCash + marketValue;

    const summary = {
      strategy,
      holdDays: portfolio.hold_days,
      startingCash,
      currentCash,
      marketValue,
      totalValue,
      returnPct: ((totalValue - startingCash) / startingCash * 100),
      realizedPnl,
      unrealizedPnl,
      wins,
      losses,
      winRate: (wins + losses) > 0 ? (wins / (wins + losses) * 100) : 0,
      openCount: open.length,
      closedCount: closed.length,
    };

    // Format positions for frontend
    const openPositions = open.map((p: Record<string, string | null>) => ({
      id: p.id,
      cardName: p.card_name,
      productId: p.product_id,
      setCode: p.set_code || '',
      rarity: p.rarity || '',
      buyPrice: parseFloat(p.buy_price!),
      currentPrice: p.current_price ? parseFloat(p.current_price) : parseFloat(p.buy_price!),
      quantity: parseInt(p.quantity!),
      predictedChangePct: parseFloat(p.predicted_change_pct!),
      predictionStdPct: p.prediction_std_pct ? parseFloat(p.prediction_std_pct) : null,
      confidence: p.confidence ? parseFloat(p.confidence) : null,
      breakEvenPrice: (() => {
        const bp = parseFloat(p.buy_price!);
        const qty = parseInt(p.quantity!);
        return (bp * qty + TRANSACTION_FEE_FLAT * qty) / ((1 - SELLER_COMMISSION_PCT - TRANSACTION_FEE_PCT) * qty);
      })(),
      tournamentDate: p.tournament_date,
      expiryDate: p.expiry_date,
      boughtAt: p.bought_at,
      daysHeld: Math.floor(
        ((simDate ? new Date(simDate).getTime() : Date.now()) - new Date(p.tournament_date!).getTime())
        / (1000 * 60 * 60 * 24)
      ),
      unrealizedPnl: (() => {
        const qty = parseInt(p.quantity!);
        const currentPrice = p.current_price ? parseFloat(p.current_price) : parseFloat(p.buy_price!);
        const buyCost = parseFloat(p.buy_price!) * qty;
        return netSellAfterFees(currentPrice, qty) - buyCost;
      })(),
      grossReturnPct: p.current_price
        ? ((parseFloat(p.current_price) - parseFloat(p.buy_price!)) / parseFloat(p.buy_price!) * 100)
        : 0,
    }));

    const closedTrades = closed.map((t: Record<string, string | null>) => ({
      id: t.id,
      cardName: t.card_name,
      productId: t.product_id,
      setCode: t.set_code || '',
      rarity: t.rarity || '',
      buyPrice: parseFloat(t.buy_price!),
      sellPrice: t.sell_price ? parseFloat(t.sell_price) : 0,
      quantity: parseInt(t.quantity!),
      predictedChangePct: parseFloat(t.predicted_change_pct!),
      profit: t.profit ? parseFloat(t.profit) : 0,
      fees: t.fees ? parseFloat(t.fees) : 0,
      sellReason: t.sell_reason || '',
      confidence: t.confidence ? parseFloat(t.confidence) : null,
      breakEvenPrice: (() => {
        const bp = parseFloat(t.buy_price!);
        const qty = parseInt(t.quantity!);
        return (bp * qty + TRANSACTION_FEE_FLAT * qty) / ((1 - SELLER_COMMISSION_PCT - TRANSACTION_FEE_PCT) * qty);
      })(),
      tournamentDate: t.tournament_date,
      soldAt: t.sold_at,
      peakDuringHold: t.peak_during_hold ? parseFloat(t.peak_during_hold) : null,
      peakDuringHoldDate: t.peak_during_hold_date || null,
      peakAfterSell: t.peak_after_sell ? parseFloat(t.peak_after_sell) : null,
      peakAfterSellDate: t.peak_after_sell_date || null,
      grossReturnPct: t.sell_price && t.buy_price
        ? ((parseFloat(t.sell_price) - parseFloat(t.buy_price)) / parseFloat(t.buy_price) * 100)
        : 0,
    }));

    return NextResponse.json({
      summary,
      openPositions,
      closedTrades,
      simulationDate: simDate,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Trading API error:', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
