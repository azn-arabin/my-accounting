'use client';

import { format, subMonths } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Months from the start of the data (Nov 2023) to now, newest first. */
function monthOptions(): Record<string, string> {
  const items: Record<string, string> = {};
  for (let i = 0; ; i++) {
    const d = subMonths(new Date(), i);
    const value = format(d, 'yyyy-MM');
    if (value < '2023-11') break;
    items[value] = format(d, 'MMMM yyyy');
  }
  return items;
}

export function currentMonth() {
  return format(new Date(), 'yyyy-MM');
}

export function monthLabel(month: string) {
  return format(new Date(`${month}-01T00:00:00`), 'MMMM yyyy');
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const items = monthOptions();
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger className="w-48" aria-label="Month">
        <CalendarDays className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-80">
        {Object.entries(items).map(([v, label]) => (
          <SelectItem key={v} value={v}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
