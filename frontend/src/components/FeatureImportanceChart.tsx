'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MLFeatureImportance } from '@/lib/types';

interface FeatureImportanceChartProps {
  data: MLFeatureImportance[];
}

const FEATURE_LABELS: Record<string, string> = {
  price_at_tournament: 'Price at Tournament',
  price_tier: 'Price Tier',
  price_volatility_7d: 'Price Volatility (7d)',
  momentum_1d: 'Momentum (1d)',
  momentum_3d: 'Momentum (3d)',
  momentum_7d: 'Momentum (7d)',
  avg_prior_price_change: 'Avg Prior Price Change',
  num_printings: 'Num Printings',
  card_tournament_count: 'Tournament Count',
  top_cut_rate: 'Top Cut Rate',
  tournament_size: 'Tournament Size',
  relative_placement: 'Relative Placement',
};

export default function FeatureImportanceChart({ data }: FeatureImportanceChartProps) {
  const chartData = data.map(d => ({
    ...d,
    label: FEATURE_LABELS[d.feature] || d.feature,
  }));

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">Feature Importance</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis type="number" stroke="#9CA3AF" fontSize={12} />
          <YAxis
            type="category"
            dataKey="label"
            stroke="#9CA3AF"
            fontSize={12}
            width={110}
          />
          <Tooltip
            formatter={(value) => Number(value).toFixed(4)}
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="importance" fill="#10B981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
