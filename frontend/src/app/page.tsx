'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import PriceChart from '@/components/PriceChart';
import SalesChart from '@/components/SalesChart';
import SalesList from '@/components/SalesList';
import { SearchResult } from '@/lib/types';

const DEFAULT_CARD = 'Ash Blossom & Joyous Spring';

export default function Home() {
  const [selectedCard, setSelectedCard] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load default card on mount
  useEffect(() => {
    const loadDefaultCard = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(DEFAULT_CARD)}`);
        const results = await res.json();
        if (results.length > 0) {
          setSelectedCard(results[0]);
        }
      } catch (error) {
        console.error('Failed to load default card:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDefaultCard();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">CardzTzar Dashboard</h1>
          <div className="flex gap-2">
            <Link href="/ml" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              ML Analytics
            </Link>
            <Link href="/report" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              Report
            </Link>
            <Link href="/clustering" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              Clustering
            </Link>
            <Link href="/cooccurrence" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              Co-occurrence
            </Link>
            <Link href="/debug" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
              Debug
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        <div className="mb-6">
          <SearchBar onSelect={setSelectedCard} />
        </div>

        {selectedCard ? (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{selectedCard.card_name}</h2>
                  <p className="text-gray-400">
                    {selectedCard.set_name} ({selectedCard.set_code}) - {selectedCard.rarity}
                  </p>
                </div>
                <div className="text-right">
                  {selectedCard.latest_price && (
                    <div className="text-3xl font-bold text-green-400">
                      ${Number(selectedCard.latest_price).toFixed(2)}
                    </div>
                  )}
                  <div className="text-sm text-gray-400">
                    Product ID: {selectedCard.product_id}
                  </div>
                </div>
              </div>
            </div>

            <PriceChart
              productId={selectedCard.product_id}
              cardName={selectedCard.card_name}
            />

            <SalesChart
              productId={selectedCard.product_id}
              cardName={selectedCard.card_name}
            />

            <SalesList productId={selectedCard.product_id} />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-96 text-gray-400">
            <svg
              className="w-16 h-16 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-xl">Search for a card to view price data</p>
          </div>
        )}
      </main>
    </div>
  );
}
