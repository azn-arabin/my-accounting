'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown, Search, Tags } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { flattenCategories, TYPE_LABELS, type CategoryLite, type CategoryType, type FlatCategory } from '@/lib/categories';
import { cn } from '@/lib/utils';

/** Indented, searchable list of categories (any depth), grouped by type. */
export function CategoryTreeList({
  categories,
  type,
  query,
  renderRow,
}: {
  categories: CategoryLite[];
  type?: CategoryType;
  query: string;
  renderRow: (c: FlatCategory, searching: boolean) => React.ReactNode;
}) {
  const q = query.trim().toLowerCase();
  const types: CategoryType[] = type ? [type] : ['expense', 'income', 'transfer'];
  return (
    <>
      {types.map(t => {
        const flat = flattenCategories(categories, t);
        // While searching, show matches plus the categories above them so the tree still makes sense
        const visible = q
          ? flat.filter(c => flat.some(m => m.name.toLowerCase().includes(q) && (m.id === c.id || m.path.startsWith(`${c.path} › `))))
          : flat;
        if (!visible.length) return null;
        return (
          <div key={t} className="pb-1">
            {!type && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{TYPE_LABELS[t]}</p>}
            {visible.map(c => renderRow(c, !!q))}
          </div>
        );
      })}
    </>
  );
}

export const indent = (depth: number) => ({ paddingLeft: `${0.5 + (depth - 1) * 1.1}rem` });

/**
 * Pick one category (any level). `allLabel` adds an "all categories" choice (value null).
 * `isDisabled` greys out rows that can't be chosen (e.g. would exceed the depth limit).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  type,
  placeholder = 'Choose a category',
  allLabel,
  isDisabled,
  labelFor,
  className,
  disabled,
  'aria-label': ariaLabel,
}: {
  categories: CategoryLite[];
  value: number | null;
  onChange: (id: number | null) => void;
  type?: CategoryType;
  placeholder?: string;
  allLabel?: string;
  isDisabled?: (c: FlatCategory) => boolean;
  /** Text shown in the trigger; defaults to the full path */
  labelFor?: (c: FlatCategory) => string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = useMemo(() => flattenCategories(categories).find(c => c.id === value), [categories, value]);
  const pick = (id: number | null) => { onChange(id); setOpen(false); setQuery(''); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={ariaLabel}
        render={<Button variant="outline" className={cn('h-9 w-full justify-between gap-2 px-3 font-normal', className)} />}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', !selected && !allLabel && 'text-muted-foreground')}>
            {selected ? (labelFor ? labelFor(selected) : selected.path) : allLabel ?? placeholder}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-72 gap-0 p-0">
        <div className="relative border-b p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories…" className="h-8 border-0 pl-8 shadow-none focus-visible:ring-0" autoFocus />
        </div>
        <div className="max-h-80 overflow-y-auto p-1" role="listbox">
          {allLabel && !query && (
            <Option active={value === null} onClick={() => pick(null)} style={indent(1)}>{allLabel}</Option>
          )}
          <CategoryTreeList
            categories={categories}
            type={type}
            query={query}
            renderRow={(c, searching) => {
              const off = isDisabled?.(c) ?? false;
              return (
                <Option key={c.id} active={c.id === value} disabled={off} onClick={() => !off && pick(c.id)} style={indent(c.depth)}>
                  <span className={cn('truncate', c.depth === 1 && 'font-medium')}>{searching && c.depth > 1 ? c.path : c.name}</span>
                  {c.hasChildren && allLabel && <span className="text-xs text-muted-foreground">+ sub</span>}
                </Option>
              );
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Option({ active, disabled, onClick, style, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; style?: React.CSSProperties; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      aria-disabled={disabled}
      onClick={onClick}
      style={style}
      className={cn(
        'flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors',
        disabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-accent',
        active && 'bg-accent font-medium',
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  );
}
