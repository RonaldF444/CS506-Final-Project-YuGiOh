'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { MarketIndexPoint } from '@/lib/types';

const TIME_RANGES = [
  { label: '30D', value: '30' },
  { label: '90D', value: '90' },
  { label: '180D', value: '180' },
  { label: '1Y', value: '365' },
];

export default function MarketIndexChart() {
  const [data, setData] = useState<MarketIndexPoint[]>([]);
  const [range, setRange] = useState('90');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchIndex = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/debug/market-index?range=${range}`);
        const json = await res.json();
        if (Array.isArray(json)) {
          setData(json);
        } else {
          console.error('Market index API error:', json);
          setData([]);
        }
      } catch (error) {
        console.error('Market index fetch error:', error);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIndex();
  }, [range]);

  const formatXAxis = (day: string) => {
    return format(new Date(day + 'T00:00:00'), 'MMM d');
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          Market Index
          {latest && (
            <span className={`text-lg font-medium ${latest.overall >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {latest.overall.toFixed(1)}
            </span>
          )}
        </h2>
        <div className="flex gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setRange(tr.value)}
              className={`px-3 py-1 rounded text-sm ${
                range === tr.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Average price index across all cards $1+. Baseline = 100 at start of period.
        Segments: Budget ($1-5), Mid ($5-20), Premium ($20+).
      </p>

      {isLoading ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          Loading...
        </div>
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-gray-400">
          No market data available
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="day"
              tickFormatter={formatXAxis}
              stroke="#9CA3AF"
              fontSize={12}
            />
            <YAxis
              stroke="#9CA3AF"
              fontSize={12}
              domain={['auto', 'auto']}
              tickFormatter={(v) => v.toFixed(0)}
            />
            <Tooltip
              formatter={(value) => Number(value).toFixed(2)}
              labelFormatter={(label) => format(new Date(label + 'T00:00:00'), 'MMM d, yyyy')}
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
            />
            <Legend />
            <ReferenceLine y={100} stroke="#6B7280" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="overall"
              name="Overall"
              stroke="#FFFFFF"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="budget"
              name="Budget ($1-5)"
              stroke="#10B981"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="mid"
              name="Mid ($5-20)"
              stroke="#F59E0B"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="premium"
              name="Premium ($20+)"
              stroke="#A78BFA"
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {latest && (
        <div className="mt-3 grid grid-cols-4 gap-4 text-center text-sm">
          <div>
            <div className={`font-bold ${latest.overall >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {latest.overall >= 100 ? '+' : ''}{(latest.overall - 100).toFixed(1)}%
            </div>
            <div className="text-gray-500">Overall</div>
          </div>
          <div>
            <div className={`font-bold ${(latest.budget ?? 100) >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {(latest.budget ?? 100) >= 100 ? '+' : ''}{((latest.budget ?? 100) - 100).toFixed(1)}%
            </div>
            <div className="text-gray-500">Budget</div>
          </div>
          <div>
            <div className={`font-bold ${(latest.mid ?? 100) >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {(latest.mid ?? 100) >= 100 ? '+' : ''}{((latest.mid ?? 100) - 100).toFixed(1)}%
            </div>
            <div className="text-gray-500">Mid</div>
          </div>
          <div>
            <div className={`font-bold ${(latest.premium ?? 100) >= 100 ? 'text-green-400' : 'text-red-400'}`}>
              {(latest.premium ?? 100) >= 100 ? '+' : ''}{((latest.premium ?? 100) - 100).toFixed(1)}%
            </div>
            <div className="text-gray-500">Premium</div>
          </div>
        </div>
      )}
    </div>
  );
}
