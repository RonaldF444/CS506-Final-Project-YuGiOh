'use client';

import { useState, useEffect, useRef } from 'react';
import { SearchResult } from '@/lib/types';

interface SearchBarProps {
  onSelect: (card: SearchResult) => void;
}

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const search = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query]);

  const handleSelect = (card: SearchResult) => {
    onSelect(card);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-xl">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search cards..."
        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
      />
      {isLoading && (
        <div className="absolute right-3 top-3 text-gray-400">
          Loading...
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {results.map((card) => (
            <button
              key={`${card.product_id}`}
              onClick={() => handleSelect(card)}
              className="w-full px-4 py-3 text-left hover:bg-gray-700 border-b border-gray-700 last:border-b-0"
            >
              <div className="font-medium text-white">{card.card_name}</div>
              <div className="text-sm text-gray-400">
                {card.set_name} ({card.set_code}) - {card.rarity}
                {card.latest_price && (
                  <span className="ml-2 text-green-400">${Number(card.latest_price).toFixed(2)}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
