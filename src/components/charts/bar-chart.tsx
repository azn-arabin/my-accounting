'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartCard, EmptyChart, SERIES, SeriesLegend, SeriesTooltip, axisTaka } from './chart-parts';

interface MonthlyBarChartProps {
  data: Array<{ month: string; income: number; expense: number }>;
  subtitle?: string;
  className?: string;
}

export function MonthlyBarChart({ data, subtitle, className }: MonthlyBarChartProps) {
  const hasData = data.some(d => d.income || d.expense);

  return (
    <ChartCard title="Income vs expense" subtitle={subtitle} action={hasData ? <SeriesLegend /> : undefined} className={className}>
      {!hasData ? (
        <EmptyChart message="No data for these months" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
            <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={axisTaka} />
            <Tooltip content={<SeriesTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
            {(['income', 'expense'] as const).map(k => (
              <Bar key={k} dataKey={k} fill={SERIES[k].color} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={400} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
