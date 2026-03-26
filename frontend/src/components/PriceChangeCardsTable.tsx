'use client';

import { useState } from 'react';
import { MLPriceChangeCard } from '@/lib/types';

interface PriceChangeCardsTableProps {
  data: MLPriceChangeCard[];
}

type SortKey = 'card_name' | 'mean_price_change' | 'appearances';

function getChangeColor(change: number): string {
  if (change >= 100) return 'text-red-400';
  if (change >= 50) return 'text-yellow-400';
  if (change >= 20) return 'text-green-400';
  return 'text-gray-300';
}

export default function PriceChangeCardsTable({ data }: PriceChangeCardsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('mean_price_change');
  const [sortDesc, setSortDesc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const sorted = [...data].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
    }
    return sortDesc ? (bVal as number) - (aVal as number) : (aVal as number) - (bVal as number);
  });

  const SortHeader = ({ field, children }: { field: SortKey; children: React.ReactNode }) => (
    <th
      className="text-left py-2 cursor-pointer hover:text-white"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortKey === field && (
        <span className="ml-1">{sortDesc ? '\u2193' : '\u2191'}</span>
      )}
    </th>
  );

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-2">Top Price Change Cards</h2>
      <p className="text-sm text-gray-400 mb-4">
        Cards with the highest mean peak price change after tournament appearances (min 10 appearances)
      </p>
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="text-gray-400 border-b border-gray-700 sticky top-0 bg-gray-800">
            <tr>
              <th className="text-left py-2 w-8">#</th>
              <SortHeader field="card_name">Card Name</SortHeader>
              <SortHeader field="mean_price_change">Mean Change</SortHeader>
              <SortHeader field="appearances">Appearances</SortHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map((card, i) => (
              <tr key={card.card_name} className="border-b border-gray-700 hover:bg-gray-700">
                <td className="py-2 text-gray-500">{i + 1}</td>
                <td className="py-2">{card.card_name}</td>
                <td className={`py-2 font-medium ${getChangeColor(card.mean_price_change)}`}>
                  +{card.mean_price_change.toFixed(1)}%
                </td>
                <td className="py-2 text-gray-400">{card.appearances}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
