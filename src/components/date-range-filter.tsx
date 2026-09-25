'use client';

import { endOfMonth, endOfYear, format, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { CalendarRange } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';

export type RangePreset = 'this-month' | 'last-month' | 'last-3' | 'last-6' | 'last-12' | 'this-year' | 'last-year' | 'all' | 'custom';

export interface DateRange {
  preset: RangePreset;
  start: string; // YYYY-MM-DD or '' (open)
  end: string;
}

const PRESETS: Record<RangePreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3': 'Last 3 months',
  'last-6': 'Last 6 months',
  'last-12': 'Last 12 months',
  'this-year': 'This year',
  'last-year': 'Last year',
  all: 'All time',
  custom: 'Custom range',
};

const d = (x: Date) => format(x, 'yyyy-MM-dd');

export function rangeFor(preset: RangePreset, now = new Date()): DateRange {
  switch (preset) {
    case 'this-month': return { preset, start: d(startOfMonth(now)), end: d(endOfMonth(now)) };
    case 'last-month': { const m = subMonths(now, 1); return { preset, start: d(startOfMonth(m)), end: d(endOfMonth(m)) }; }
    case 'last-3': return { preset, start: d(startOfMonth(subMonths(now, 2))), end: d(endOfMonth(now)) };
    case 'last-6': return { preset, start: d(startOfMonth(subMonths(now, 5))), end: d(endOfMonth(now)) };
    case 'last-12': return { preset, start: d(startOfMonth(subMonths(now, 11))), end: d(endOfMonth(now)) };
    case 'this-year': return { preset, start: d(startOfYear(now)), end: d(endOfYear(now)) };
    case 'last-year': { const y = new Date(now.getFullYear() - 1, 0, 1); return { preset, start: d(startOfYear(y)), end: d(endOfYear(y)) }; }
    case 'all': return { preset, start: '', end: '' };
    case 'custom': return { preset, start: d(startOfMonth(now)), end: d(now) };
  }
}

export function rangeLabel(r: DateRange) {
  if (r.preset !== 'custom') return PRESETS[r.preset];
  const f = (s: string) => (s ? format(new Date(`${s}T00:00:00`), 'd MMM yyyy') : '…');
  return `${f(r.start)} – ${f(r.end)}`;
}

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select items={PRESETS} value={value.preset} onValueChange={(v) => v && onChange(v === 'custom' ? { ...value, preset: 'custom' } : rangeFor(v as RangePreset))}>
        <SelectTrigger className="w-44" aria-label="Date range">
          <CalendarRange className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PRESETS) as RangePreset[]).map((p) => (
            <div key={p}>
              {p === 'custom' && <SelectSeparator />}
              <SelectItem value={p}>{PRESETS[p]}</SelectItem>
            </div>
          ))}
        </SelectContent>
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input type="date" aria-label="From" className="w-40" value={value.start} max={value.end || undefined} onChange={(e) => onChange({ ...value, start: e.target.value })} />
          <span className="text-muted-foreground">–</span>
          <Input type="date" aria-label="To" className="w-40" value={value.end} min={value.start || undefined} onChange={(e) => onChange({ ...value, end: e.target.value })} />
        </>
      )}
    </div>
  );
}
