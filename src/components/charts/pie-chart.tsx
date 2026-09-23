'use client';

import { formatCurrency } from '@/lib/formatters';
import { ChartCard, EmptyChart } from './chart-parts';

interface CategoryPieChartProps {
  data: Array<{ name: string; amount: number; color: string | null }>;
  subtitle?: string;
  className?: string;
  /** How many categories to list before folding the rest into "Other". */
  limit?: number;
}

/**
 * Expense by category as a ranked bar list: with many categories a donut can't be read, and one hue
 * keeps identity on the label instead of on color.
 */
export function CategoryPieChart({ data, subtitle, className, limit = 7 }: CategoryPieChartProps) {
  const total = data.reduce((s, c) => s + c.amount, 0);
  const shown = data.slice(0, limit);
  const rest = data.slice(limit);
  const rows = rest.length
    ? [...shown, { name: `Other (${rest.length})`, amount: rest.reduce((s, c) => s + c.amount, 0), color: null }]
    : shown;
  const max = Math.max(...rows.map(r => r.amount), 1);

  return (
    <ChartCard title="Expense by category" subtitle={subtitle} className={className}>
      {!rows.length ? (
        <EmptyChart message="No expenses in this period" />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const pct = total ? (r.amount / total) * 100 : 0;
            return (
              <li key={r.name} className="group" title={`${r.name}: ${formatCurrency(r.amount)} (${pct.toFixed(1)}%)`}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 tabular">
                    <span className="font-medium">{formatCurrency(r.amount)}</span>
                    <span className="ml-2 inline-block w-11 text-right text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width,opacity] duration-500 group-hover:opacity-80"
                    style={{ width: `${(r.amount / max) * 100}%`, backgroundColor: 'var(--expense)' }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </ChartCard>
  );
}
