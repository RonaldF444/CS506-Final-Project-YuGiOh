'use client';

import { useState, useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CardProfile } from '@/lib/types';

const FEATURE_LABELS: Record<string, string> = {
  price_at_tournament: 'Avg Price ($)',
  price_volatility_7d: 'Price Volatility (7d)',
  num_printings: 'Number of Printings',
  card_tournament_count: 'Tournament Appearances',
  top_cut_rate: 'Top-Cut Rate',
  avg_prior_price_change: 'Avg Prior Price Change (%)',
};

const FEATURE_KEYS = Object.keys(FEATURE_LABELS);

const LOG_RECOMMENDED = new Set([
  'price_at_tournament', 'num_printings', 'card_tournament_count', 'avg_prior_price_change',
]);

// Distinct cluster colors
const CLUSTER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#6366F1'];

// Gradient: blue -> yellow -> red
function valueToColor(t: number): string {
  if (t < 0.5) {
    const s = t * 2;
    const r = Math.round(59 + s * (245 - 59));
    const g = Math.round(130 + s * (158 - 130));
    const b = Math.round(246 + s * (11 - 246));
    return `rgb(${r},${g},${b})`;
  } else {
    const s = (t - 0.5) * 2;
    const r = Math.round(245 + s * (239 - 245));
    const g = Math.round(158 + s * (68 - 158));
    const b = Math.round(11 + s * (68 - 11));
    return `rgb(${r},${g},${b})`;
  }
}

interface ClusterScatterPlotProps {
  cards: CardProfile[];
  hasClusters?: boolean;
}

function safeLog(v: number): number {
  return Math.log10(Math.max(v, 0.001) + 1);
}

type ColorMode = 'cluster' | 'gradient';

export default function ClusterScatterPlot({ cards, hasClusters }: ClusterScatterPlotProps) {
  const [xFeature, setXFeature] = useState('price_at_tournament');
  const [yFeature, setYFeature] = useState('card_tournament_count');
  const [colorFeature, setColorFeature] = useState('avg_prior_price_change');
  const [colorMode, setColorMode] = useState<ColorMode>(hasClusters ? 'cluster' : 'gradient');
  const [xLog, setXLog] = useState(true);
  const [yLog, setYLog] = useState(true);

  const { data, colorMin, colorMax } = useMemo(() => {
    const colorVals = cards.map(c => c[colorFeature as keyof CardProfile] as number);
    const cMin = Math.min(...colorVals);
    const cMax = Math.max(...colorVals);
    const cRange = cMax - cMin || 1;

    const points = cards.map((card) => {
      const xRaw = card[xFeature as keyof CardProfile] as number;
      const yRaw = card[yFeature as keyof CardProfile] as number;
      const colorVal = card[colorFeature as keyof CardProfile] as number;
      const colorNorm = (colorVal - cMin) / cRange;
      const cluster = card.cluster ?? 0;
      return {
        x: xLog ? safeLog(xRaw) : xRaw,
        y: yLog ? safeLog(yRaw) : yRaw,
        xRaw,
        yRaw,
        colorVal,
        colorNorm,
        cluster,
        fill: colorMode === 'cluster'
          ? CLUSTER_COLORS[cluster % CLUSTER_COLORS.length]
          : valueToColor(colorNorm),
        card_name: card.card_name,
        price_at_tournament: card.price_at_tournament,
        price_volatility_7d: card.price_volatility_7d,
        num_printings: card.num_printings,
        card_tournament_count: card.card_tournament_count,
        top_cut_rate: card.top_cut_rate,
        avg_prior_price_change: card.avg_prior_price_change,
      };
    });
    return { data: points, colorMin: cMin, colorMax: cMax };
  }, [cards, xFeature, yFeature, colorFeature, colorMode, xLog, yLog]);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: Record<string, number | string> }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3 text-sm">
        <p className="font-bold text-white mb-1">{d.card_name}</p>
        {hasClusters && <p className="text-gray-300">Cluster: {d.cluster}</p>}
        {FEATURE_KEYS.map((key) => (
          <p key={key} className={`text-gray-300 ${colorMode === 'gradient' && key === colorFeature ? 'font-semibold text-yellow-300' : ''}`}>
            {FEATURE_LABELS[key]}: {typeof d[key] === 'number' ? (d[key] as number).toFixed(4) : d[key]}
          </p>
        ))}
      </div>
    );
  };

  const xLabel = FEATURE_LABELS[xFeature] + (xLog ? ' (log)' : '');
  const yLabel = FEATURE_LABELS[yFeature] + (yLog ? ' (log)' : '');

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Card Feature Space</h2>
      <p className="text-sm text-gray-400 mb-4">
        {cards.length} cards — select axes and color mode to explore groupings
      </p>

      <div className="flex flex-wrap gap-4 mb-4 items-end">
        <div>
          <label className="text-sm text-gray-400 mr-2">X Axis:</label>
          <select
            value={xFeature}
            onChange={(e) => { setXFeature(e.target.value); setXLog(LOG_RECOMMENDED.has(e.target.value)); }}
            className="bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            {FEATURE_KEYS.map((key) => (
              <option key={key} value={key}>{FEATURE_LABELS[key]}</option>
            ))}
          </select>
          <label className="ml-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={xLog} onChange={(e) => setXLog(e.target.checked)} className="mr-1" />
            Log
          </label>
        </div>
        <div>
          <label className="text-sm text-gray-400 mr-2">Y Axis:</label>
          <select
            value={yFeature}
            onChange={(e) => { setYFeature(e.target.value); setYLog(LOG_RECOMMENDED.has(e.target.value)); }}
            className="bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            {FEATURE_KEYS.map((key) => (
              <option key={key} value={key}>{FEATURE_LABELS[key]}</option>
            ))}
          </select>
          <label className="ml-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={yLog} onChange={(e) => setYLog(e.target.checked)} className="mr-1" />
            Log
          </label>
        </div>
        <div>
          <label className="text-sm text-gray-400 mr-2">Color:</label>
          <div className="inline-flex rounded border border-gray-600 overflow-hidden">
            {hasClusters && (
              <button
                onClick={() => setColorMode('cluster')}
                className={`px-3 py-1 text-sm ${colorMode === 'cluster' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
              >
                Cluster
              </button>
            )}
            <button
              onClick={() => setColorMode('gradient')}
              className={`px-3 py-1 text-sm ${colorMode === 'gradient' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            >
              Feature
            </button>
          </div>
          {colorMode === 'gradient' && (
            <select
              value={colorFeature}
              onChange={(e) => setColorFeature(e.target.value)}
              className="ml-2 bg-gray-700 text-white rounded px-3 py-1 text-sm border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              {FEATURE_KEYS.map((key) => (
                <option key={key} value={key}>{FEATURE_LABELS[key]}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 mb-3 text-xs text-gray-400">
        {colorMode === 'cluster' ? (
          <div className="flex gap-3">
            {Array.from(new Set(cards.map(c => c.cluster ?? 0))).sort().map((c) => (
              <span key={c} className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: CLUSTER_COLORS[c % CLUSTER_COLORS.length] }} />
                Cluster {c}
              </span>
            ))}
          </div>
        ) : (
          <>
            <span>{colorMin.toFixed(2)}</span>
            <div className="h-3 w-48 rounded" style={{
              background: 'linear-gradient(to right, rgb(59,130,246), rgb(245,158,11), rgb(239,68,68))',
            }} />
            <span>{colorMax.toFixed(2)}</span>
            <span className="ml-1">({FEATURE_LABELS[colorFeature]})</span>
          </>
        )}
      </div>

      <ResponsiveContainer width="100%" height={500}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            type="number"
            dataKey="x"
            stroke="#9CA3AF"
            fontSize={12}
            label={{ value: xLabel, position: 'bottom', fill: '#9CA3AF', fontSize: 12, offset: 15 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            stroke="#9CA3AF"
            fontSize={12}
            label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: '#9CA3AF', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Scatter data={data}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} opacity={0.7} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
