'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import PortfolioChart from '@/components/PortfolioChart';

interface Summary {
  strategy: string;
  holdDays: number;
  startingCash: number;
  currentCash: number;
  marketValue: number;
  totalValue: number;
  returnPct: number;
  realizedPnl: number;
  unrealizedPnl: number;
  wins: number;
  losses: number;
  winRate: number;
  openCount: number;
  closedCount: number;
}

interface OpenPosition {
  id: number;
  cardName: string;
  productId: number;
  setCode: string;
  rarity: string;
  buyPrice: number;
  currentPrice: number;
  quantity: number;
  predictedChangePct: number;
  predictionStdPct: number | null;
  confidence: number | null;
  breakEvenPrice: number;
  tournamentDate: string;
  expiryDate: string;
  daysHeld: number;
  unrealizedPnl: number;
  grossReturnPct: number;
}

interface ClosedTrade {
  id: number;
  cardName: string;
  productId: number;
  setCode: string;
  rarity: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  predictedChangePct: number;
  profit: number;
  fees: number;
  sellReason: string;
  confidence: number | null;
  breakEvenPrice: number;
  tournamentDate: string;
  soldAt: string;
  peakDuringHold: number | null;
  peakDuringHoldDate: string | null;
  peakAfterSell: number | null;
  peakAfterSellDate: string | null;
  grossReturnPct: number;
}

interface TradingData {
  summary: Summary;
  openPositions: OpenPosition[];
  closedTrades: ClosedTrade[];
  simulationDate: string | null;
  lastUpdated: string;
}

const STRATEGIES = ['default'];
const REFRESH_INTERVAL = 60000;

function formatDollars(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatPct(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function pnlColor(n: number): string {
  if (n > 0) return 'text-green-400';
  if (n < 0) return 'text-red-400';
  return 'text-gray-400';
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

function sortRows<T>(rows: T[], state: SortState, getters: Record<string, (row: T) => string | number | null>): T[] {
  if (!state) return rows;
  const getter = getters[state.key];
  if (!getter) return rows;
  const sorted = [...rows].sort((a, b) => {
    const va = getter(a);
    const vb = getter(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') {
      return va - vb;
    }
    return String(va).localeCompare(String(vb));
  });
  return state.dir === 'desc' ? sorted.reverse() : sorted;
}

function sortIndicator(state: SortState, key: string): string {
  if (!state || state.key !== key) return '';
  return state.dir === 'asc' ? ' ↑' : ' ↓';
}

export default function TradingPage() {
  const [strategy, setStrategy] = useState('default');
  const [data, setData] = useState<TradingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [openSort, setOpenSort] = useState<SortState>(null);
  const [closedSort, setClosedSort] = useState<SortState>({ key: 'soldAt', dir: 'desc' });

  const toggleSort = (current: SortState, setter: (s: SortState) => void, key: string) => {
    if (current?.key !== key) {
      setter({ key, dir: 'desc' });
    } else if (current.dir === 'desc') {
      setter({ key, dir: 'asc' });
    } else {
      setter(null);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/trading?strategy=${strategy}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        setData(null);
      } else {
        setData(json);
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch trading data:', err);
      setError('Failed to load trading data');
    } finally {
      setIsLoading(false);
      setLastRefresh(new Date());
    }
  }, [strategy]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading Trading Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">Paper Trading</h1>
          </div>
          <div className="text-sm text-gray-500 text-right">
            {data?.simulationDate && (
              <div className="text-amber-400 font-medium">
                Sim date: {new Date(data.simulationDate).toLocaleDateString()}
              </div>
            )}
            <div>Last updated: {lastRefresh.toLocaleTimeString()}</div>
          </div>
        </div>
      </header>

      <div className="border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex">
          {STRATEGIES.map((s) => (
            <button
              key={s}
              onClick={() => setStrategy(s)}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                strategy === s
                  ? 'text-white border-b-2 border-blue-500 bg-gray-800'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {error ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-xl text-gray-400">{error}</p>
            <p className="text-sm text-gray-500 mt-2">
              Make sure the paper trader has been run at least once.
            </p>
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <SummaryCard label="Total Value" value={`$${data.summary.totalValue.toFixed(2)}`}
                color={data.summary.totalValue >= data.summary.startingCash ? 'text-green-400' : 'text-red-400'} />
              <SummaryCard label="Return" value={formatPct(data.summary.returnPct)}
                color={pnlColor(data.summary.returnPct)} />
              <SummaryCard label="Realized P&L" value={formatDollars(data.summary.realizedPnl)}
                color={pnlColor(data.summary.realizedPnl)} />
              <SummaryCard label="Unrealized P&L" value={formatDollars(data.summary.unrealizedPnl)}
                color={pnlColor(data.summary.unrealizedPnl)} />
              <SummaryCard label="Win Rate" value={`${data.summary.winRate.toFixed(1)}%`}
                color={data.summary.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'} />
              <SummaryCard label="W/L" value={`${data.summary.wins}/${data.summary.losses}`}
                color="text-white" />
              <SummaryCard label="Cash" value={`$${data.summary.currentCash.toFixed(2)}`}
                color="text-gray-300" />
            </div>

            <PortfolioChart strategy={strategy} />

            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                Open Positions
                <span className="text-sm font-normal text-gray-500">({data.openPositions.length})</span>
              </h2>
              {data.openPositions.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500">
                  No open positions
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          {([
                            { key: 'cardName', label: 'Card', className: 'px-2 py-2' },
                            { key: 'setCode', label: 'Set', className: 'px-2 py-2' },
                            { key: 'quantity', label: 'Qty', className: 'px-2 py-2 text-right' },
                            { key: 'buyPrice', label: 'Buy', className: 'px-2 py-2 text-right' },
                            { key: 'currentPrice', label: 'Cur', className: 'px-2 py-2 text-right' },
                            { key: 'breakEvenPrice', label: 'B/E', className: 'px-2 py-2 text-right' },
                            { key: 'totalCost', label: 'Cost', className: 'px-2 py-2 text-right' },
                            { key: 'totalValue', label: 'Value', className: 'px-2 py-2 text-right' },
                            { key: 'grossReturnPct', label: 'Ret', className: 'px-2 py-2 text-right' },
                            { key: 'unrealizedPnl', label: 'P&L', className: 'px-2 py-2 text-right' },
                            { key: 'predictedChangePct', label: 'Pred', className: 'px-2 py-2 text-right' },
                            { key: 'confidence', label: 'Conf', className: 'px-2 py-2 text-right' },
                            { key: 'tournamentDate', label: 'Bought', className: 'px-2 py-2' },
                            { key: 'daysHeld', label: 'Days', className: 'px-2 py-2 text-right' },
                            { key: 'expiryDate', label: 'Expires', className: 'px-2 py-2' },
                          ] as const).map(col => (
                            <th
                              key={col.key}
                              className={`${col.className} cursor-pointer select-none hover:text-gray-200`}
                              onClick={() => toggleSort(openSort, setOpenSort, col.key)}
                            >
                              {col.label}{sortIndicator(openSort, col.key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const totalQty = data.openPositions.reduce((s, p) => s + p.quantity, 0);
                          const totalCost = data.openPositions.reduce((s, p) => s + p.buyPrice * p.quantity, 0);
                          const totalValue = data.openPositions.reduce((s, p) => s + p.currentPrice * p.quantity, 0);
                          const totalUnrealized = data.openPositions.reduce((s, p) => s + p.unrealizedPnl, 0);
                          const totalReturnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;
                          const openGetters: Record<string, (p: OpenPosition) => string | number | null> = {
                            cardName: p => p.cardName,
                            setCode: p => p.setCode,
                            quantity: p => p.quantity,
                            buyPrice: p => p.buyPrice,
                            currentPrice: p => p.currentPrice,
                            totalCost: p => p.buyPrice * p.quantity,
                            totalValue: p => p.currentPrice * p.quantity,
                            grossReturnPct: p => p.grossReturnPct,
                            unrealizedPnl: p => p.unrealizedPnl,
                            predictedChangePct: p => p.predictedChangePct,
                            confidence: p => p.confidence,
                            breakEvenPrice: p => p.breakEvenPrice,
                            tournamentDate: p => p.tournamentDate,
                            daysHeld: p => p.daysHeld,
                            expiryDate: p => p.expiryDate,
                          };
                          const sortedOpen = sortRows(data.openPositions, openSort, openGetters);
                          return (
                            <>
                        {sortedOpen.map((pos) => (
                          <tr key={pos.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="px-2 py-2 font-medium">{pos.cardName}</td>
                            <td className="px-2 py-2 text-gray-400">{pos.setCode}</td>
                            <td className="px-2 py-2 text-right">{pos.quantity}</td>
                            <td className="px-2 py-2 text-right">${pos.buyPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">${pos.currentPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-orange-400">${pos.breakEvenPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-gray-300">${(pos.buyPrice * pos.quantity).toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-gray-300">${(pos.currentPrice * pos.quantity).toFixed(2)}</td>
                            <td className={`px-2 py-2 text-right ${pnlColor(pos.grossReturnPct)}`}>
                              {formatPct(pos.grossReturnPct)}
                            </td>
                            <td className={`px-2 py-2 text-right ${pnlColor(pos.unrealizedPnl)}`}>
                              {formatDollars(pos.unrealizedPnl)}
                            </td>
                            <td className="px-2 py-2 text-right text-blue-400">
                              +{pos.predictedChangePct.toFixed(1)}%
                              {pos.predictionStdPct != null && (
                                <span className="text-gray-500 ml-1">±{pos.predictionStdPct.toFixed(1)}%</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right text-yellow-400">
                              {pos.confidence != null ? pos.confidence.toFixed(2) : '—'}
                            </td>
                            <td className="px-2 py-2 text-gray-400">
                              {new Date(pos.tournamentDate).toLocaleDateString()}
                            </td>
                            <td className="px-2 py-2 text-right">{pos.daysHeld}</td>
                            <td className="px-2 py-2 text-gray-400">
                              {new Date(pos.expiryDate).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-600 bg-gray-900/50 font-semibold">
                          <td className="px-2 py-2" colSpan={2}>TOTAL</td>
                          <td className="px-2 py-2 text-right">{totalQty}</td>
                          <td className="px-2 py-2 text-right text-gray-500" colSpan={2}>—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-100">${totalCost.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-gray-100">${totalValue.toFixed(2)}</td>
                          <td className={`px-2 py-2 text-right ${pnlColor(totalReturnPct)}`}>
                            {formatPct(totalReturnPct)}
                          </td>
                          <td className={`px-2 py-2 text-right ${pnlColor(totalUnrealized)}`}>
                            {formatDollars(totalUnrealized)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-500" colSpan={5}>—</td>
                        </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                Closed Trades
                <span className="text-sm font-normal text-gray-500">({data.closedTrades.length})</span>
              </h2>
              {data.closedTrades.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500">
                  No closed trades yet
                </div>
              ) : (
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-700 text-gray-400 text-left">
                          {([
                            { key: 'cardName', label: 'Card', className: 'px-2 py-2' },
                            { key: 'setCode', label: 'Set', className: 'px-2 py-2' },
                            { key: 'quantity', label: 'Qty', className: 'px-2 py-2 text-right' },
                            { key: 'buyPrice', label: 'Buy', className: 'px-2 py-2 text-right' },
                            { key: 'sellPrice', label: 'Sell', className: 'px-2 py-2 text-right' },
                            { key: 'predictedChangePct', label: 'Predicted', className: 'px-2 py-2 text-right' },
                            { key: 'confidence', label: 'Conf', className: 'px-2 py-2 text-right' },
                            { key: 'breakEvenPrice', label: 'B/E', className: 'px-2 py-2 text-right' },
                            { key: 'peakDuringHold', label: 'Peak Held', className: 'px-2 py-2 text-right' },
                            { key: 'peakAfterSell', label: 'Peak After', className: 'px-2 py-2 text-right' },
                            { key: 'totalBought', label: 'Bought $', className: 'px-2 py-2 text-right' },
                            { key: 'totalSold', label: 'Sold $', className: 'px-2 py-2 text-right' },
                            { key: 'grossReturnPct', label: 'Gross', className: 'px-2 py-2 text-right' },
                            { key: 'profit', label: 'Profit', className: 'px-2 py-2 text-right' },
                            { key: 'fees', label: 'Fees', className: 'px-2 py-2 text-right' },
                            { key: 'sellReason', label: 'Reason', className: 'px-2 py-2' },
                            { key: 'tournamentDate', label: 'Bought', className: 'px-2 py-2' },
                            { key: 'soldAt', label: 'Sold', className: 'px-2 py-2' },
                          ] as const).map(col => (
                            <th
                              key={col.key}
                              className={`${col.className} cursor-pointer select-none hover:text-gray-200`}
                              onClick={() => toggleSort(closedSort, setClosedSort, col.key)}
                            >
                              {col.label}{sortIndicator(closedSort, col.key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const cTotalQty = data.closedTrades.reduce((s, t) => s + t.quantity, 0);
                          const cTotalBought = data.closedTrades.reduce((s, t) => s + t.buyPrice * t.quantity, 0);
                          const cTotalSold = data.closedTrades.reduce((s, t) => s + t.sellPrice * t.quantity, 0);
                          const cTotalProfit = data.closedTrades.reduce((s, t) => s + t.profit, 0);
                          const cTotalFees = data.closedTrades.reduce((s, t) => s + t.fees, 0);
                          const cTotalGrossPct = cTotalBought > 0 ? ((cTotalSold - cTotalBought) / cTotalBought) * 100 : 0;
                          const shortDate = (s: string | null) => {
                            if (!s) return '';
                            const d = new Date(s);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          };
                          const closedGetters: Record<string, (t: ClosedTrade) => string | number | null> = {
                            cardName: t => t.cardName,
                            setCode: t => t.setCode,
                            quantity: t => t.quantity,
                            buyPrice: t => t.buyPrice,
                            sellPrice: t => t.sellPrice,
                            predictedChangePct: t => t.predictedChangePct,
                            confidence: t => t.confidence,
                            breakEvenPrice: t => t.breakEvenPrice,
                            peakDuringHold: t => t.peakDuringHold,
                            peakAfterSell: t => t.peakAfterSell,
                            totalBought: t => t.buyPrice * t.quantity,
                            totalSold: t => t.sellPrice * t.quantity,
                            grossReturnPct: t => t.grossReturnPct,
                            profit: t => t.profit,
                            fees: t => t.fees,
                            sellReason: t => t.sellReason,
                            tournamentDate: t => t.tournamentDate,
                            soldAt: t => t.soldAt,
                          };
                          const sortedClosed = sortRows(data.closedTrades, closedSort, closedGetters);
                          return (
                            <>
                        {sortedClosed.map((trade) => (
                          <tr key={trade.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                            <td className="px-2 py-2 font-medium">{trade.cardName}</td>
                            <td className="px-2 py-2 text-gray-400">{trade.setCode}</td>
                            <td className="px-2 py-2 text-right">{trade.quantity}</td>
                            <td className="px-2 py-2 text-right">${trade.buyPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right">${trade.sellPrice.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right text-blue-400">
                              +{trade.predictedChangePct.toFixed(1)}%
                            </td>
                            <td className="px-2 py-2 text-right text-yellow-400">
                              {trade.confidence != null ? trade.confidence.toFixed(2) : '—'}
                            </td>
                            <td className="px-2 py-2 text-right text-orange-400">
                              ${trade.breakEvenPrice.toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-400">
                              {trade.peakDuringHold != null ? (
                                <div>
                                  <div>${trade.peakDuringHold.toFixed(2)}</div>
                                  {trade.peakDuringHoldDate && (
                                    <div className="text-gray-500 text-[10px]">{shortDate(trade.peakDuringHoldDate)}</div>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-400">
                              {trade.peakAfterSell != null ? (
                                <div>
                                  <div>${trade.peakAfterSell.toFixed(2)}</div>
                                  {trade.peakAfterSellDate && (
                                    <div className="text-gray-500 text-[10px]">{shortDate(trade.peakAfterSellDate)}</div>
                                  )}
                                </div>
                              ) : '—'}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              ${(trade.buyPrice * trade.quantity).toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-300">
                              ${(trade.sellPrice * trade.quantity).toFixed(2)}
                            </td>
                            <td className={`px-2 py-2 text-right ${pnlColor(trade.grossReturnPct)}`}>
                              {formatPct(trade.grossReturnPct)}
                            </td>
                            <td className={`px-2 py-2 text-right font-medium ${pnlColor(trade.profit)}`}>
                              {formatDollars(trade.profit)}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-500">
                              ${trade.fees.toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-gray-400 max-w-[120px] truncate" title={trade.sellReason}>
                              {trade.sellReason}
                            </td>
                            <td className="px-2 py-2 text-gray-400">
                              {shortDate(trade.tournamentDate) || '-'}
                            </td>
                            <td className="px-2 py-2 text-gray-400">
                              {shortDate(trade.soldAt) || '-'}
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-600 bg-gray-900/50 font-semibold">
                          <td className="px-2 py-2" colSpan={2}>TOTAL</td>
                          <td className="px-2 py-2 text-right">{cTotalQty}</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-500">—</td>
                          <td className="px-2 py-2 text-right text-gray-100">${cTotalBought.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right text-gray-100">${cTotalSold.toFixed(2)}</td>
                          <td className={`px-2 py-2 text-right ${pnlColor(cTotalGrossPct)}`}>
                            {formatPct(cTotalGrossPct)}
                          </td>
                          <td className={`px-2 py-2 text-right ${pnlColor(cTotalProfit)}`}>
                            {formatDollars(cTotalProfit)}
                          </td>
                          <td className="px-2 py-2 text-right text-gray-300">
                            ${cTotalFees.toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-gray-500" colSpan={3}>—</td>
                        </tr>
                            </>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}
