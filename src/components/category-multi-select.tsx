'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, Tags, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { categoryTree, TYPE_LABELS, type CategoryLite, type CategoryType } from '@/lib/categories';
import { cn } from '@/lib/utils';

/**
 * Pick any mix of main and sub categories. Picking a main category covers its sub-categories
 * (the server expands it), so its children are shown as included.
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
      // a main category already covers its children
      if (c.parentId === null) categories.filter(ch => ch.parentId === c.id).forEach(ch => next.delete(ch.id));
    }
    onChange([...next]);
  };

  const q = query.trim().toLowerCase();
  const matches = (c: CategoryLite) => !q || c.name.toLowerCase().includes(q);

  const label =
    value.length === 0
      ? 'Choose categories'
      : value.length === 1
        ? byId.get(value[0])?.name ?? '1 category'
        : `${value.length} categories`;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn('h-9 justify-between gap-2 font-normal', className)} />
        }
      >
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
          {(['expense', 'income', 'transfer'] as CategoryType[]).map(type => {
            const roots = categoryTree(categories, type).filter(r => matches(r) || r.children.some(matches));
            if (!roots.length) return null;
            return (
              <div key={type} className="pb-1">
                <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{TYPE_LABELS[type]}</p>
                {roots.map(root => {
                  const rootOn = selected.has(root.id);
                  return (
                    <div key={root.id}>
                      <Row label={root.name} checked={rootOn} count={root.txnCount} onClick={() => toggle(root)} />
                      {root.children.filter(ch => matches(ch) || matches(root)).map(ch => (
                        <Row
                          key={ch.id}
                          label={ch.name}
                          checked={rootOn || selected.has(ch.id)}
                          implied={rootOn}
                          count={ch.txnCount}
                          indent
                          onClick={() => !rootOn && toggle(ch)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })}
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

function Row({ label, checked, implied, indent, count, onClick }: {
  label: string; checked: boolean; implied?: boolean; indent?: boolean; count?: number; onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
        indent && 'pl-7',
        implied && 'cursor-default text-muted-foreground hover:bg-transparent',
      )}
      title={implied ? 'Included through its main category' : undefined}
    >
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input', implied && 'opacity-60')}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className="tabular text-xs text-muted-foreground">{count}</span>}
    </button>
  );
}
