'use client';

import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

/** Card shell shared by every chart/section: title, optional subtitle and right-side slot. */
export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col rounded-xl border bg-card p-5 shadow-xs', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return <div className="flex h-full min-h-40 items-center justify-center text-sm text-muted-foreground">{message}</div>;
}

export const SERIES = {
  income: { label: 'Income', color: 'var(--income)' },
  expense: { label: 'Expense', color: 'var(--expense)' },
} as const;

/** Legend for the two income/expense series (identity is never color-alone: the label sits beside the swatch). */
export function SeriesLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      {Object.values(SERIES).map(s => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Compact axis ticks: ৳12k, ৳1.2L (paisa in). */
export function axisTaka(paisa: number) {
  const t = paisa / 100;
  if (Math.abs(t) >= 100000) return `৳${(t / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (Math.abs(t) >= 1000) return `৳${(t / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `৳${t}`;
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
}

/** Tooltip body styled with the app's tokens (values in ink, the swatch carries identity). */
export function SeriesTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg">
      <p className="mb-1.5 font-medium">{label}</p>
      {payload.map(p => {
        const s = SERIES[p.dataKey as keyof typeof SERIES];
        return (
          <div key={String(p.dataKey)} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s?.color ?? p.color }} />
              {s?.label ?? p.dataKey}
            </span>
            <span className="tabular font-medium">{formatCurrency(Number(p.value))}</span>
          </div>
        );
      })}
    </div>
  );
}
