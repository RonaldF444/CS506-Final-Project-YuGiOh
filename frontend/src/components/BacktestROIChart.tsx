'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BacktestSummary } from '@/lib/types';

interface BacktestROIChartProps {
  data: BacktestSummary;
}

export default function BacktestROIChart({ data }: BacktestROIChartProps) {
  const chartData = data.rank_results.map(r => ({
    label: `Top ${r.top_n}`,
    with_fee_roi: r.with_fee_roi,
    zero_fee_roi: r.zero_fee_roi,
    win_rate: r.win_rate,
    trades: r.trades,
    avg_actual_change: r.avg_actual_change,
    edge: r.edge_vs_baseline,
  }));

  const feePct = ((data.fee_config.commission_pct + data.fee_config.transaction_fee_pct) * 100).toFixed(2);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Rank-Based Backtest</h2>
      <p className="text-sm text-gray-400 mb-4">
        Top-N cards per tournament by predicted change | {data.n_tournaments} tournaments | {data.eligible_cards.toLocaleString()} eligible cards ≥ ${data.min_card_price.toFixed(2)}
      </p>

      <div className="mb-4 p-3 bg-gray-700 rounded text-sm text-gray-300">
        Random baseline (5 cards/tournament, {data.random_baseline.n_trials} trials): {data.random_baseline.roi.toFixed(2)}% ± {data.random_baseline.std.toFixed(2)}% ROI
        <span className="text-gray-500 ml-3">| Fees: {feePct}% + ${data.fee_config.flat_fee.toFixed(2)} flat</span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="label" stroke="#9CA3AF" fontSize={12} />
          <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                with_fee_roi: 'With-Fee ROI',
                zero_fee_roi: 'Zero-Fee ROI',
              };
              return [`${value.toFixed(2)}%`, labels[name] || name];
            }}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
          />
          <ReferenceLine
            y={data.random_baseline.roi}
            stroke="#F59E0B"
            strokeDasharray="5 5"
            label={{ value: `Random: ${data.random_baseline.roi}%`, fill: '#F59E0B', fontSize: 11, position: 'right' }}
          />
          <Bar dataKey="zero_fee_roi" name="zero_fee_roi" fill="#6B7280" radius={[4, 4, 0, 0]} />
          <Bar dataKey="with_fee_roi" name="with_fee_roi" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.with_fee_roi >= 0 ? '#10B981' : '#EF4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Detailed table below chart */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-b border-gray-700">
            <tr>
              <th className="text-left py-2">Top N</th>
              <th className="text-right py-2">Trades</th>
              <th className="text-right py-2">Avg Actual</th>
              <th className="text-right py-2">Edge</th>
              <th className="text-right py-2">Zero-Fee ROI</th>
              <th className="text-right py-2">With-Fee ROI</th>
              <th className="text-right py-2">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {data.rank_results.map(r => (
              <tr key={r.top_n} className="border-b border-gray-700">
                <td className="py-2 font-medium">Top {r.top_n}</td>
                <td className="py-2 text-right">{r.trades}</td>
                <td className="py-2 text-right">{r.avg_actual_change.toFixed(2)}%</td>
                <td className={`py-2 text-right ${r.edge_vs_baseline >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {r.edge_vs_baseline >= 0 ? '+' : ''}{r.edge_vs_baseline.toFixed(2)}%
                </td>
                <td className="py-2 text-right">{r.zero_fee_roi.toFixed(2)}%</td>
                <td className={`py-2 text-right font-medium ${r.with_fee_roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {r.with_fee_roi >= 0 ? '+' : ''}{r.with_fee_roi.toFixed(2)}%
                </td>
                <td className="py-2 text-right">{r.win_rate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
