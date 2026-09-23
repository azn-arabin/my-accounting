'use client';

import { History } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HISTORICAL_LABELS, parseHistoricalMode, type HistoricalMode } from '@/lib/historical';

const HINTS: Record<HistoricalMode, string> = {
  include: 'Imported history + new entries',
  exclude: 'Only entries added in the app',
  only: 'Only the imported (SMS) history',
};

export function HistoricalFilter({
  value,
  onChange,
  className = 'w-44',
}: {
  value: HistoricalMode;
  onChange: (mode: HistoricalMode) => void;
  className?: string;
}) {
  return (
    <Select items={HISTORICAL_LABELS} value={value} onValueChange={(v) => onChange(parseHistoricalMode(v as string | null))}>
      <SelectTrigger className={className} aria-label="Historical data">
        <History className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="w-64">
        {(Object.keys(HISTORICAL_LABELS) as HistoricalMode[]).map(m => (
          <SelectItem key={m} value={m}>
            <span className="flex flex-col">
              <span>{HISTORICAL_LABELS[m]}</span>
              <span className="text-xs font-normal text-muted-foreground">{HINTS[m]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
