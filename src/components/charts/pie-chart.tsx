'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';

interface CategoryPieChartProps {
  data: Array<{ name: string; amount: number; color: string | null }>;
}

const DEFAULT_COLORS = ['#f97316', '#8b5cf6', '#eab308', '#ec4899', '#ef4444', '#06b6d4', '#6366f1', '#84cc16'];

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  if (!data.length) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Expense by Category</h3>
        <p className="text-muted-foreground text-center py-10">No expenses this month</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Expense by Category</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={3}
            dataKey="amount"
            nameKey="name"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any) => [formatCurrency(Number(value)), 'Amount']}
            contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
          />
          <Legend
            verticalAlign="bottom"
            formatter={(value: string) => <span className="text-sm text-foreground">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

