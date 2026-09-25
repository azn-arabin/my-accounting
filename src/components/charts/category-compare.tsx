'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import { axisTaka } from './chart-parts';

export interface CategorySeries {
  /** stable identity of the series (a category or a group) — its color follows this */
  key: string;
  name: string;
  kind?: 'category' | 'group';
  parentName: string | null;
  amount: number;
  monthly: number[];
}

const SLOTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)'];
const OTHER_COLOR = 'var(--muted-foreground)';
export const MAX_SERIES = SLOTS.length;

/**
 * Colors follow the category, not its rank: a category keeps its slot while it stays visible, and
 * new ones take the lowest free slot. Beyond 7 categories the rest fold into "Other" (gray).
 */
const slotMemory = new Map<string, number>(); // series key → palette slot, kept for the session

export function withSeriesColors(list: CategorySeries[]) {
  const visible = list.slice(0, MAX_SERIES);
  const taken = new Set<number>();
  const assigned = new Map<string, number>();
  for (const s of visible) {
    const prev = slotMemory.get(s.key);
    if (prev !== undefined && !taken.has(prev)) { assigned.set(s.key, prev); taken.add(prev); }
  }
  for (const s of visible) {
    if (assigned.has(s.key)) continue;
    const free = SLOTS.findIndex((_, i) => !taken.has(i));
    assigned.set(s.key, free);
    taken.add(free);
  }
  assigned.forEach((slot, id) => slotMemory.set(id, slot));
  const rest = list.slice(MAX_SERIES);
  const series = [
    ...visible.map(s => ({ ...s, color: SLOTS[assigned.get(s.key)!] })),
    ...(rest.length
      ? [{
          key: 'other',
          name: `Other (${rest.length})`,
          parentName: null,
          amount: rest.reduce((a, s) => a + s.amount, 0),
          monthly: rest[0].monthly.map((_, i) => rest.reduce((a, s) => a + s.monthly[i], 0)),
          color: OTHER_COLOR,
        }]
      : []),
  ];
  return series;
}

type Colored = CategorySeries & { color: string };

export function CompareLegend({ series, total }: { series: Colored[]; total: number }) {
  return (
    <ul className="space-y-2 text-sm">
      {series.map(s => (
        <li key={s.key} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.name}</span>
            {s.kind === 'group' && <GroupBadge />}
          </span>
          <span className="tabular shrink-0">
            <span className="font-medium">{formatCurrency(s.amount)}</span>
            <span className="ml-2 inline-block w-11 text-right text-xs text-muted-foreground">{total ? ((s.amount / total) * 100).toFixed(1) : '0.0'}%</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CompareBars({ series, total }: { series: Colored[]; total: number }) {
  const max = Math.max(...series.map(s => s.amount), 1);
  return (
    <ul className="space-y-3">
      {series.map(s => (
        <li key={s.key} className="group" title={`${s.name}: ${formatCurrency(s.amount)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">
              {s.name}
              {s.kind === 'group' && <GroupBadge />}
              {s.parentName && <span className="ml-1.5 text-xs text-muted-foreground">in {s.parentName}</span>}
            </span>
            <span className="tabular shrink-0">
              <span className="font-medium">{formatCurrency(s.amount)}</span>
              <span className="ml-2 inline-block w-11 text-right text-xs text-muted-foreground">{total ? ((s.amount / total) * 100).toFixed(1) : '0.0'}%</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full transition-[width] duration-500 group-hover:opacity-85" style={{ width: `${(s.amount / max) * 100}%`, backgroundColor: s.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CompareDonut({ series, total }: { series: Colored[]; total: number }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[260px_1fr]">
      <div className="relative h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={series} dataKey="amount" nameKey="name" innerRadius={78} outerRadius={118} paddingAngle={1} stroke="var(--card)" strokeWidth={2} animationDuration={400}>
              {series.map(s => <Cell key={s.key} fill={s.color} />)}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Colored;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                    <p className="flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />{p.name}</p>
                    <p className="tabular mt-0.5">{formatCurrency(p.amount)} · {total ? ((p.amount / total) * 100).toFixed(1) : 0}%</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="tabular text-lg font-semibold">{formatCurrency(total)}</span>
        </div>
      </div>
      <CompareLegend series={series} total={total} />
    </div>
  );
}

export function CompareTrend({ series, months }: { series: Colored[]; months: string[] }) {
  const data = months.map((m, i) => ({
    month: format(new Date(`${m}-01T00:00:00`), months.length > 12 ? 'MMM yy' : 'MMM'),
    fullMonth: format(new Date(`${m}-01T00:00:00`), 'MMMM yyyy'),
    ...Object.fromEntries(series.map(s => [s.key, s.monthly[i]])),
  }));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.map(s => (
          <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />{s.name}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} minTickGap={12} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={axisTaka} />
          <Tooltip
            cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as { fullMonth: string };
              const items = [...payload].sort((a, b) => Number(b.value) - Number(a.value));
              return (
                <div className="min-w-48 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                  <p className="mb-1.5 font-medium">{row.fullMonth}</p>
                  {items.map(p => {
                    const s = series.find(x => x.key === p.dataKey);
                    return (
                      <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
                        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: s?.color }} />{s?.name}</span>
                        <span className="tabular font-medium">{formatCurrency(Number(p.value))}</span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {series.map(s => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={months.length <= 12 ? { r: 3, strokeWidth: 0, fill: s.color } : false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }} animationDuration={400} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GroupBadge() {
  return <span className="ml-1.5 rounded bg-muted px-1 py-px align-middle text-[10px] font-medium tracking-wide text-muted-foreground uppercase">group</span>;
}
