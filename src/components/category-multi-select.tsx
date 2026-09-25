'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, Tags, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategoryTreeList, indent } from '@/components/category-picker';
import { ancestorsOf, descendantIds, type CategoryLite } from '@/lib/categories';
import { cn } from '@/lib/utils';

/**
 * Pick any mix of categories at any level. Picking a category covers everything below it
 * (the server expands it), so those rows show as included.
 */
export function CategoryMultiSelect({
  categories,
  value,
  onChange,
  className,
}: {
  categories: CategoryLite[];
  value: number[];
  onChange: (ids: number[]) => void;
  className?: string;
}) {
  const [query, setQuery] = useState('');
  const selected = new Set(value);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const toggle = (c: CategoryLite) => {
    const next = new Set(selected);
    if (next.has(c.id)) next.delete(c.id);
    else {
      next.add(c.id);
      // it already covers everything below it
      descendantIds(c.id, categories).forEach(d => next.delete(d));
    }
    onChange([...next]);
  };

  const label =
    value.length === 0
      ? 'Choose categories'
      : value.length === 1
        ? byId.get(value[0])?.name ?? '1 category'
        : `${value.length} categories`;

  return (
    <Popover onOpenChange={(o) => { if (!o) setQuery(''); }}>
      <PopoverTrigger render={<Button variant="outline" className={cn('h-9 justify-between gap-2 font-normal', className)} />}>
        <span className="flex min-w-0 items-center gap-2">
          <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !value.length && 'text-muted-foreground')}>{label}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-0 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories…" className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0" autoFocus />
        </div>
        <div className="max-h-80 overflow-y-auto p-1">
          <CategoryTreeList
            categories={categories}
            query={query}
            renderRow={(c, searching) => {
              const covered = ancestorsOf(c, byId).some(a => selected.has(a.id));
              const checked = covered || selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => !covered && toggle(c)}
                  style={indent(c.depth)}
                  title={covered ? 'Included through a category above it' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-accent',
                    covered && 'cursor-default text-muted-foreground hover:bg-transparent',
                  )}
                >
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input', covered && 'opacity-60')}>
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn('flex-1 truncate', c.depth === 1 && 'font-medium')}>{searching && c.depth > 1 ? c.path : c.name}</span>
                  {c.txnCount !== undefined && <span className="tabular text-xs text-muted-foreground">{c.txnCount}</span>}
                </button>
              );
            }}
          />
        </div>
        {value.length > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{value.length} selected</span>
            <button type="button" className="flex items-center gap-1 font-medium text-foreground hover:underline" onClick={() => onChange([])}>
              <X className="h-3 w-3" /> Clear
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
