'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Sale } from '@/lib/types';

interface SalesListProps {
  productId: number;
}

export default function SalesList({ productId }: SalesListProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSales = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/sales/${productId}?limit=100`);
        const data = await res.json();
        // Handle error responses or non-array data
        if (Array.isArray(data)) {
          setSales(data);
        } else {
          console.error('Sales API error:', data);
          setSales([]);
        }
      } catch (error) {
        console.error('Sales fetch error:', error);
        setSales([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSales();
  }, [productId]);

  const getConditionColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case 'near mint':
        return 'text-green-400';
      case 'lightly played':
        return 'text-yellow-400';
      case 'moderately played':
        return 'text-orange-400';
      case 'heavily played':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h2 className="text-xl font-bold text-white mb-4">Recent Sales</h2>
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h2 className="text-xl font-bold text-white mb-4">
        Recent Sales ({sales.length})
      </h2>
      {sales.length === 0 ? (
        <div className="text-gray-400">No sales data available</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Condition</th>
                <th className="pb-2 pr-4">Variant</th>
                <th className="pb-2 pr-4">Qty</th>
                <th className="pb-2 pr-4">Price</th>
                <th className="pb-2">Shipping</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale, idx) => (
                <tr
                  key={`${sale.order_date}-${idx}`}
                  className="border-b border-gray-700 hover:bg-gray-700"
                >
                  <td className="py-2 pr-4 text-gray-300">
                    {format(new Date(sale.order_date), 'MMM d, HH:mm')}
                  </td>
                  <td className={`py-2 pr-4 ${getConditionColor(sale.condition)}`}>
                    {sale.condition}
                  </td>
                  <td className="py-2 pr-4 text-gray-300">
                    {sale.variant || '-'}
                  </td>
                  <td className="py-2 pr-4 text-gray-300">{sale.quantity}</td>
                  <td className="py-2 pr-4 text-green-400 font-medium">
                    ${Number(sale.purchase_price).toFixed(2)}
                  </td>
                  <td className="py-2 text-gray-400">
                    ${Number(sale.shipping_price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
