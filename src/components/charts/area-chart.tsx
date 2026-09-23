'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartCard, EmptyChart, SERIES, SeriesLegend, SeriesTooltip, axisTaka } from './chart-parts';

interface DailyTrendChartProps {
  data: Array<{ date: string; income: number; expense: number }>;
  subtitle?: string;
  className?: string;
}

export function DailyTrendChart({ data, subtitle, className }: DailyTrendChartProps) {
  const hasData = data.some(d => d.income || d.expense);

  return (
    <ChartCard title="Daily trend" subtitle={subtitle} action={hasData ? <SeriesLegend /> : undefined} className={className}>
      {!hasData ? (
        <EmptyChart message="No income or expenses in this period" />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {(['income', 'expense'] as const).map(k => (
                <linearGradient key={k} id={`grad-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES[k].color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={SERIES[k].color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={axisTaka} />
            <Tooltip content={<SeriesTooltip />} cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }} />
            {(['income', 'expense'] as const).map(k => (
              <Area
                key={k}
                type="monotone"
                dataKey={k}
                stroke={SERIES[k].color}
                strokeWidth={2}
                fill={`url(#grad-${k})`}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
                animationDuration={400}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
