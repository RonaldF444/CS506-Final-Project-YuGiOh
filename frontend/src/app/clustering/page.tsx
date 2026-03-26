'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ClusterExploration } from '@/lib/types';
import ClusterScatterPlot from '@/components/ClusterScatterPlot';
import FeatureHistograms from '@/components/FeatureHistograms';
import ElbowChart from '@/components/ElbowChart';

const FEATURE_LABELS: Record<string, string> = {
  price_at_tournament: 'Avg Price ($)',
  price_volatility_7d: 'Price Volatility (7d)',
  num_printings: 'Number of Printings',
  card_tournament_count: 'Tournament Appearances',
  top_cut_rate: 'Top-Cut Rate',
  avg_prior_price_change: 'Avg Prior Price Change (%)',
};

const CLUSTER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];

export default function ClusteringPage() {
  const [data, setData] = useState<ClusterExploration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/cluster-data');
        const json = await res.json();
        if (json.error) {
          setError(json.error);
        } else {
          setData(json);
        }
      } catch {
        setError('Failed to load cluster exploration data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading cluster data...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 max-w-lg text-center">
          <h2 className="text-xl font-bold mb-4">Cluster Data Not Found</h2>
          <p className="text-gray-400 mb-4">{error}</p>
          <p className="text-gray-500 text-sm">
            Run <code className="bg-gray-700 px-2 py-1 rounded">python main.py</code> in the price predictor repo to generate the data.
          </p>
          <Link href="/" className="text-blue-400 hover:text-blue-300 mt-4 inline-block">&larr; Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const hasClusters = !!data.elbow_data && data.elbow_data.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">Clustering Exploration</h1>
          </div>
          <span className="text-sm text-gray-500">
            Generated: {new Date(data.generated_date).toLocaleDateString()}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Object.entries(data.feature_stats).map(([feat, stats]) => (
            <div key={feat} className="bg-gray-800 rounded-lg p-4">
              <div className="text-xs text-gray-400 mb-1">{FEATURE_LABELS[feat] || feat}</div>
              <div className="text-lg font-bold">{stats.mean.toFixed(2)}</div>
              <div className="text-xs text-gray-500">
                {stats.min.toFixed(2)} — {stats.max.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Elbow chart */}
        {hasClusters && data.elbow_data && (
          <ElbowChart data={data.elbow_data} chosenK={data.n_clusters ?? 5} />
        )}

        {/* Interactive scatter plot */}
        <ClusterScatterPlot cards={data.cards} hasClusters={hasClusters} />

        {/* Cluster profiles table */}
        {data.cluster_profiles && data.cluster_profiles.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold text-white mb-4">Cluster Profiles (k={data.n_clusters})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-400">Cluster</th>
                    <th className="text-right py-2 px-3 text-gray-400">Cards</th>
                    {Object.keys(FEATURE_LABELS).map((feat) => (
                      <th key={feat} className="text-right py-2 px-3 text-gray-400">{FEATURE_LABELS[feat]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.cluster_profiles.map((cp) => (
                    <tr key={cp.cluster} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="py-2 px-3">
                        <span className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: CLUSTER_COLORS[cp.cluster % CLUSTER_COLORS.length] }} />
                          <span className="text-white font-semibold">{cp.cluster}</span>
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.count}</td>
                      <td className="py-2 px-3 text-right text-gray-300">${cp.price_at_tournament.toFixed(2)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.price_volatility_7d.toFixed(4)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.num_printings.toFixed(1)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.card_tournament_count.toFixed(0)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.top_cut_rate.toFixed(3)}</td>
                      <td className="py-2 px-3 text-right text-gray-300">{cp.avg_prior_price_change.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Feature histograms */}
        <FeatureHistograms cards={data.cards} featureStats={data.feature_stats} />

        {/* Feature stats table */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-xl font-bold text-white mb-4">Feature Summary Statistics</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-2 px-3 text-gray-400">Feature</th>
                  <th className="text-right py-2 px-3 text-gray-400">Min</th>
                  <th className="text-right py-2 px-3 text-gray-400">Max</th>
                  <th className="text-right py-2 px-3 text-gray-400">Mean</th>
                  <th className="text-right py-2 px-3 text-gray-400">Std Dev</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.feature_stats).map(([feat, stats]) => (
                  <tr key={feat} className="border-b border-gray-700 hover:bg-gray-700">
                    <td className="py-2 px-3 text-white">{FEATURE_LABELS[feat] || feat}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{stats.min.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{stats.max.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{stats.mean.toFixed(4)}</td>
                    <td className="py-2 px-3 text-right text-gray-300">{stats.std.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
