'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { format } from 'date-fns';

interface TimelinePoint {
  time: string;
  cash: number;
  holdings: number;
  totalValue: number;
}

interface PortfolioChartProps {
  strategy: string;
}

export default function PortfolioChart({ strategy }: PortfolioChartProps) {
  const [data, setData] = useState<TimelinePoint[]>([]);
  const [startingCash, setStartingCash] = useState(50000);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/trading/history?strategy=${strategy}`);
        const json = await res.json();
        if (json.timeline) {
          setData(json.timeline);
          setStartingCash(json.startingCash);
        }
      } catch (err) {
        console.error('Failed to fetch portfolio history:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [strategy]);

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 h-[300px] flex items-center justify-center">
        <span className="text-gray-500">Loading chart...</span>
      </div>
    );
  }

  if (data.length < 2) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 h-[300px] flex items-center justify-center">
        <span className="text-gray-500">Not enough data for chart</span>
      </div>
    );
  }

  // Compute Y axis domain with padding
  const allValues = data.flatMap((d) => [d.totalValue, d.cash, d.holdings]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, startingCash);
  const padding = (maxVal - minVal) * 0.1 || 500;

  const LABELS: Record<string, string> = {
    totalValue: 'Portfolio Value',
    cash: 'Cash',
    holdings: 'Holdings',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3">Portfolio Value Over Time</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <defs>
            <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="time"
            tickFormatter={(t: string) => format(new Date(t), 'MMM d')}
            stroke="#6B7280"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[minVal - padding, maxVal + padding]}
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
            stroke="#6B7280"
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelFormatter={(t: string) => format(new Date(t), 'MMM d, yyyy')}
            formatter={(value?: number, name?: string) => {
              const v = value ?? 0;
              const n = name ?? '';
              return [`$${v.toFixed(2)}`, LABELS[n] || n];
            }}
          />
          <ReferenceLine
            y={startingCash}
            stroke="#6B7280"
            strokeDasharray="3 3"
            label={{
              value: `$${(startingCash / 1000).toFixed(0)}k start`,
              position: 'right',
              fill: '#6B7280',
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="totalValue"
            stroke="#10B981"
            strokeWidth={2}
            fill="url(#totalGradient)"
            name="totalValue"
          />
          <Area
            type="monotone"
            dataKey="cash"
            stroke="#3B82F6"
            strokeWidth={1.5}
            fill="none"
            name="cash"
          />
          <Area
            type="monotone"
            dataKey="holdings"
            stroke="#F59E0B"
            strokeWidth={1.5}
            fill="none"
            name="invested"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-2 justify-center text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 inline-block"></span> Portfolio</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-blue-500 inline-block"></span> Cash</span>
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-yellow-500 inline-block"></span> Holdings</span>
      </div>
    </div>
  );
}
