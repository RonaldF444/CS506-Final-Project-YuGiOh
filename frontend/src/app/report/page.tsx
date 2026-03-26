'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CS506Report } from '@/lib/types';
import FeatureImportanceChart from '@/components/FeatureImportanceChart';
import TargetDistributionChart from '@/components/TargetDistributionChart';
import PredictedVsActualChart from '@/components/PredictedVsActualChart';
import BacktestROIChart from '@/components/BacktestROIChart';

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-sm text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState<CS506Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch('/api/report');
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          setReport(data);
        }
      } catch (err) {
        console.error('Failed to fetch report:', err);
        setError('Failed to load report data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading Report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-900 text-white">
        <header className="border-b border-gray-800 p-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">Model Report</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto p-4">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-xl text-gray-400 mb-2">{error || 'No data available'}</p>
            <p className="text-sm text-gray-500">
              Run <code className="bg-gray-700 px-2 py-1 rounded">python main.py</code> in the price predictor repo to generate report data.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const { model_info } = report;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">&larr; Back</Link>
            <h1 className="text-2xl font-bold">Model Report</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              Generated: {new Date(report.generated_date).toLocaleDateString()}
            </span>
            <Link href="/ml" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              ML Analytics
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Model Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Model" value={model_info.model_type} />
          <StatCard label="Training Rows" value={model_info.training_rows.toLocaleString()} />
          <StatCard label="Features" value={String(model_info.n_features)} />
          <StatCard
            label="Test R²"
            value={model_info.metrics.test.r2.toFixed(4)}
            color={model_info.metrics.test.r2 >= 0.05 ? 'text-green-400' : 'text-yellow-400'}
          />
          <StatCard label="Test RMSE" value={model_info.metrics.test.rmse.toFixed(2)} />
          <StatCard
            label="Spearman"
            value={report.predicted_vs_actual.spearman.toFixed(3)}
            color={report.predicted_vs_actual.spearman >= 0.3 ? 'text-green-400' : 'text-yellow-400'}
          />
        </div>

        {/* Temporal Split & Performance Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Temporal Split</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Train</span>
                <span>{model_info.date_ranges.train[0]} to {model_info.date_ranges.train[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Validation</span>
                <span>{model_info.date_ranges.val[0]} to {model_info.date_ranges.val[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Test</span>
                <span>{model_info.date_ranges.test[0]} to {model_info.date_ranges.test[1]}</span>
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
                      <td className="py-1 text-right">{model_info.metrics[split].rmse.toFixed(2)}</td>
                      <td className="py-1 text-right">{model_info.metrics[split].mae.toFixed(2)}</td>
                      <td className="py-1 text-right">{model_info.metrics[split].r2.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              Hyperparams: n_estimators={model_info.n_estimators}, max_depth={model_info.max_depth}, lr={model_info.learning_rate}
            </div>
          </div>
        </div>

        {/* Feature Importance */}
        <FeatureImportanceChart data={report.feature_importance} />

        {/* Target Distribution */}
        <TargetDistributionChart data={report.target_distribution} />

        {/* Predicted vs Actual */}
        <PredictedVsActualChart data={report.predicted_vs_actual} />

        {/* Backtest ROI */}
        <BacktestROIChart data={report.backtest} />
      </main>
    </div>
  );
}
