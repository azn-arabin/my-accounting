'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';

interface MonthlyBarChartProps {
  data: Array<{ month: string; income: number; expense: number }>;
}

export function MonthlyBarChart({ data }: MonthlyBarChartProps) {
  if (!data.length) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Monthly Comparison</h3>
        <p className="text-muted-foreground text-center py-10">No data available</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Monthly Comparison (Last 6 Months)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `৳${(v / 100).toLocaleString()}`} className="text-muted-foreground" />
          <Tooltip
            formatter={(value: any, name: any) => [formatCurrency(Number(value)), name === 'income' ? 'Income' : 'Expense']}
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Legend formatter={(value: string) => <span className="text-sm capitalize">{value}</span>} />
          <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

