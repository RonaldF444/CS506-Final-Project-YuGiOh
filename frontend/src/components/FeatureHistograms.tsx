'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { CardProfile, FeatureStat } from '@/lib/types';

const FEATURE_LABELS: Record<string, string> = {
  price_at_tournament: 'Avg Price ($)',
  price_volatility_7d: 'Price Volatility (7d)',
  num_printings: 'Number of Printings',
  card_tournament_count: 'Tournament Appearances',
  top_cut_rate: 'Top-Cut Rate',
  avg_prior_price_change: 'Avg Prior Price Change (%)',
};

interface FeatureHistogramsProps {
  cards: CardProfile[];
  featureStats: Record<string, FeatureStat>;
}

function computeBins(values: number[], numBins: number = 20) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [{ bin_start: min, bin_end: max, count: values.length, label: min.toFixed(2) }];
  }
  const binWidth = (max - min) / numBins;
  const bins = Array.from({ length: numBins }, (_, i) => ({
    bin_start: min + i * binWidth,
    bin_end: min + (i + 1) * binWidth,
    count: 0,
    label: (min + (i + 0.5) * binWidth).toFixed(2),
  }));

  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= numBins) idx = numBins - 1;
    bins[idx].count++;
  }

  return bins;
}

export default function FeatureHistograms({ cards, featureStats }: FeatureHistogramsProps) {
  const features = Object.keys(FEATURE_LABELS);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Feature Distributions</h2>
      <p className="text-sm text-gray-400 mb-4">
        Distribution of each clustering feature across {cards.length} cards
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feat) => {
          const values = cards.map((c) => c[feat as keyof CardProfile] as number);
          const bins = computeBins(values);
          const stats = featureStats[feat];

          return (
            <div key={feat} className="bg-gray-900 rounded-lg p-3">
              <h3 className="text-sm font-semibold text-white mb-1">{FEATURE_LABELS[feat]}</h3>
              <p className="text-xs text-gray-500 mb-2">
                mean: {stats.mean.toFixed(3)} | std: {stats.std.toFixed(3)}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={bins} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="label"
                    stroke="#9CA3AF"
                    fontSize={10}
                    interval="preserveStartEnd"
                    tickCount={5}
                  />
                  <YAxis stroke="#9CA3AF" fontSize={10} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [value, 'Cards']}
                    labelFormatter={(label) => `Value: ${label}`}
                  />
                  <ReferenceLine
                    x={stats.mean.toFixed(2)}
                    stroke="#F59E0B"
                    strokeDasharray="5 5"
                    label={{ value: 'mean', fill: '#F59E0B', fontSize: 10 }}
                  />
                  <Bar dataKey="count" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
