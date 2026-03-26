'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MLSummary } from '@/lib/types';
import FeatureImportanceChart from '@/components/FeatureImportanceChart';
import PriceChangeCardsTable from '@/components/PriceChangeCardsTable';
import TournamentPriceChart from '@/components/TournamentPriceChart';

export default function MLPage() {
  const [summary, setSummary] = useState<MLSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('/api/ml/summary');
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setSummary(data);
        }
      } catch (err) {
        console.error('Failed to fetch ML summary:', err);
        setError('Failed to load ML summary');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSummary();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading ML Analytics...</div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <header className="border-b border-gray-800 p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">ML Analytics</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto p-4">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-xl text-gray-400 mb-2">{error || 'No data available'}</p>
            <p className="text-sm text-gray-500">
              Run <code className="bg-gray-700 px-2 py-1 rounded">python main.py</code> in the price predictor repo to generate training data.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const overfitStatus = summary.overfitting.detected;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">ML Analytics</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              Trained: {new Date(summary.training_date).toLocaleDateString()}
            </span>
            <Link href="/debug" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              Debug
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Model Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <StatCard
            label="Training Rows"
            value={summary.training_rows.toLocaleString()}
          />
          <StatCard
            label="Mean Price Change"
            value={`${summary.mean_price_change.toFixed(1)}%`}
          />
          <StatCard
            label="Test R²"
            value={summary.metrics.test.r2.toFixed(4)}
            color={summary.metrics.test.r2 >= 0.05 ? 'text-green-400' : 'text-yellow-400'}
          />
          <StatCard
            label="Test RMSE"
            value={summary.metrics.test.rmse.toFixed(2)}
          />
          <StatCard
            label="Test MAE"
            value={summary.metrics.test.mae.toFixed(2)}
          />
          <StatCard
            label="Overfitting"
            value={overfitStatus ? 'DETECTED' : 'OK'}
            color={overfitStatus ? 'text-red-400' : 'text-green-400'}
          />
        </div>

        {/* Date Ranges & Performance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Temporal Split</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Train</span>
                <span>{summary.date_ranges.train[0]} to {summary.date_ranges.train[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Validation</span>
                <span>{summary.date_ranges.val[0]} to {summary.date_ranges.val[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Test</span>
                <span>{summary.date_ranges.test[0]} to {summary.date_ranges.test[1]}</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Performance by Split</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-gray-400">
                  <tr>
                    <th className="text-left py-1"></th>
                    <th className="text-right py-1">RMSE</th>
                    <th className="text-right py-1">MAE</th>
                    <th className="text-right py-1">R²</th>
                  </tr>
                </thead>
                <tbody>
                  {(['train', 'val', 'test'] as const).map(split => (
                    <tr key={split} className="border-t border-gray-700">
                      <td className="py-1 capitalize">{split}</td>
                      <td className="py-1 text-right">{summary.metrics[split].rmse.toFixed(2)}</td>
                      <td className="py-1 text-right">{summary.metrics[split].mae.toFixed(2)}</td>
                      <td className="py-1 text-right">{summary.metrics[split].r2.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              R² gap (train-test): {summary.overfitting.r2_gap.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Price Change Distribution */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Price Change Distribution (Training Set)</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">{summary.mean_price_change.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Mean</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{summary.median_price_change.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Median</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{summary.price_change_std.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Std Dev</div>
            </div>
          </div>
        </div>

        {/* Feature Importance */}
        <FeatureImportanceChart data={summary.feature_importance} />

        {/* Top Price Change Cards */}
        <PriceChangeCardsTable data={summary.top_price_change_cards} />

        {/* Tournament Price Chart */}
        {summary.top_price_change_cards.length > 0 && (
          <TournamentPriceChart
            cards={summary.top_price_change_cards.map(c => c.card_name)}
          />
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}
