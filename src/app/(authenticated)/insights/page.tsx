'use client';

import { useMemo, useState } from 'react';
import { BarChart3, PieChart as PieIcon, TrendingUp, Inbox, Layers, Bookmark, BookmarkCheck, Pencil, X, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { ChartCard } from '@/components/charts/chart-parts';
import { CompareBars, CompareDonut, CompareTrend, withSeriesColors } from '@/components/charts/category-compare';
import { CategoryMultiSelect } from '@/components/category-multi-select';
import { GroupEditor, type GroupDraft } from '@/components/group-editor';
import { DateRangeFilter, rangeFor, rangeLabel, type DateRange } from '@/components/date-range-filter';
import { Pagination } from '@/components/pagination';
import { TxnAmount, TxnTypeIcon, HistoricalBadge, type TxnType } from '@/components/txn-bits';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { categoryItems, type CategoryLite } from '@/lib/categories';
import { useHistoricalMode } from '@/lib/use-historical-mode';
import { apiFetch, useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

interface SeriesResult {
  key: string;
  name: string;
  kind: 'category' | 'group';
  parentName: string | null;
  types: TxnType[];
  amount: number;
  count: number;
  monthly: number[];
}

interface InsightsData {
  totals: Record<TxnType, { amount: number; count: number }>;
  series: SeriesResult[];
  months: string[];
  overlaps: string[];
}

interface SavedGroup { id: number; name: string; categoryIds: number[] }

interface Transaction {
  id: number;
  amount: number;
  type: TxnType;
  description: string | null;
  date: string;
  categoryId: number;
  accountName: string | null;
  isHistorical: boolean;
}

/** What the chart shows: single categories and/or groups (a group = one series). */
type Item =
  | { key: string; kind: 'category'; categoryId: number }
  | { key: string; kind: 'group'; name: string; categoryIds: number[]; savedId?: number };

type ChartKind = 'bars' | 'donut' | 'trend';

const PAGE_SIZE = 15;

// Keys for groups that aren't saved (yet)
let tempSeq = 0;
const tempKey = () => `t:${++tempSeq}`;

export default function InsightsPage() {
  const { mode } = useHistoricalMode();
  const [items, setItems] = useState<Item[]>([]);
  const [range, setRange] = useState<DateRange>(() => rangeFor('last-6'));
  const [group, setGroup] = useState<'main' | 'sub'>('main');
  const [chart, setChart] = useState<ChartKind>('bars');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ itemKey?: string; draft?: GroupDraft } | null>(null);

  const cats = useApi<CategoryLite[]>('/api/categories?flat=true');
  const categories = useMemo(() => (Array.isArray(cats.data) ? cats.data : []), [cats.data]);
  const labels = useMemo(() => categoryItems(categories), [categories]);
  const saved = useApi<{ groups: SavedGroup[] }>('/api/category-groups');
  const savedGroups = saved.data?.groups ?? [];

  const change = (next: Item[]) => { setItems(next); setPage(1); };

  // ---- requests
  const common = useMemo(() => {
    const p = new URLSearchParams({ historical: mode });
    if (range.start) p.set('start', range.start);
    if (range.end) p.set('end', range.end);
    return p;
  }, [mode, range]);

  const insightsUrl = useMemo(() => {
    const p = new URLSearchParams(common);
    p.set('group', group);
    if (items.length) {
      p.set('series', JSON.stringify(items.map(i => i.kind === 'category'
        ? { key: i.key, ids: [i.categoryId] }
        : { key: i.key, name: i.name, ids: i.categoryIds })));
    } else {
      p.set('type', 'expense');
    }
    return `/api/insights?${p}`;
  }, [common, group, items]);
  const insights = useApi<InsightsData>(insightsUrl);

  const historyUrl = useMemo(() => {
    const p = new URLSearchParams({ historical: mode, page: String(page), limit: String(PAGE_SIZE) });
    if (range.start) p.set('startDate', range.start);
    if (range.end) p.set('endDate', range.end);
    const ids = [...new Set(items.flatMap(i => (i.kind === 'category' ? [i.categoryId] : i.categoryIds)))];
    if (ids.length) p.set('categoryIds', ids.join(','));
    else p.set('type', 'expense');
    return `/api/transactions?${p}`;
  }, [mode, page, range, items]);
  const history = useApi<{ transactions: Transaction[]; total: number; totalPages: number }>(historyUrl);

  // ---- item helpers
  const singleIds = items.filter((i): i is Extract<Item, { kind: 'category' }> => i.kind === 'category').map(i => i.categoryId);
  const setSingles = (ids: number[]) => {
    const keep = items.filter(i => i.kind === 'group' || ids.includes(i.categoryId));
    const have = new Set(keep.filter(i => i.kind === 'category').map(i => (i as Extract<Item, { kind: 'category' }>).categoryId));
    change([...keep, ...ids.filter(id => !have.has(id)).map(id => ({ key: `c:${id}`, kind: 'category' as const, categoryId: id }))]);
  };
  const toggleSaved = (g: SavedGroup) => {
    const key = `g:${g.id}`;
    change(items.some(i => i.key === key)
      ? items.filter(i => i.key !== key)
      : [...items, { key, kind: 'group', name: g.name, categoryIds: g.categoryIds, savedId: g.id }]);
  };

  const applyGroup = async (draft: GroupDraft, save: boolean, itemKey?: string) => {
    let savedId = draft.savedId;
    if (save) {
      const body = JSON.stringify({ name: draft.name, categoryIds: draft.categoryIds });
      const res = savedId
        ? await apiFetch<{ group: SavedGroup }>(`/api/category-groups/${savedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
        : await apiFetch<{ group: SavedGroup }>('/api/category-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      savedId = res.group.id;
      saved.reload();
    }
    const item: Item = { key: savedId ? `g:${savedId}` : itemKey ?? tempKey(), kind: 'group', name: draft.name, categoryIds: draft.categoryIds, savedId };
    change(itemKey ? items.map(i => (i.key === itemKey ? item : i)) : [...items, item]);
  };

  const deleteSaved = async (savedId: number) => {
    await apiFetch(`/api/category-groups/${savedId}`, { method: 'DELETE' });
    saved.reload();
    // keep it on the chart for now, as an unsaved group
    change(items.map(i => (i.kind === 'group' && i.savedId === savedId ? { ...i, key: tempKey(), savedId: undefined } : i)));
  };

  // ---- results
  const data = insights.data;
  const rows = data?.series ?? [];
  const series = withSeriesColors(rows);
  const colorOf = new Map(series.map(s => [s.key, s.color]));
  const nonZeroTotals = data ? (Object.entries(data.totals) as Array<[TxnType, { amount: number; count: number }]>).filter(([, t]) => t.count > 0) : [];
  const chartTotal = rows.reduce((s, r) => s + r.amount, 0);
  const monthsCount = Math.max(data?.months.length ?? 1, 1);
  const mixedTypes = new Set(rows.flatMap(r => r.types)).size > 1;
  const hasSplittable = items.some(i => i.kind === 'category' && categories.some(c => c.parentId === i.categoryId));

  return (
    <>
      <PageHeader title="Insights" description="Compare categories and your own groups of categories over any period" />

      {/* Controls */}
      <div className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryMultiSelect categories={categories} value={singleIds} onChange={setSingles} className="w-56" />
          <Button variant="outline" onClick={() => setEditor({})}><Layers /> New group</Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <Bookmark /> Saved groups{savedGroups.length ? ` (${savedGroups.length})` : ''}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {savedGroups.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No saved groups yet. Make a group and tick “Save for later”.</p>
              ) : (
                <>
                  <DropdownMenuLabel>Show on the chart</DropdownMenuLabel>
                  {savedGroups.map(g => {
                    const on = items.some(i => i.key === `g:${g.id}`);
                    return (
                      <DropdownMenuItem key={g.id} onClick={() => toggleSaved(g)} closeOnClick={false}>
                        <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1 truncate">{g.name}</span>
                        <span className="text-xs text-muted-foreground">{g.categoryIds.length}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DateRangeFilter value={range} onChange={(r) => { setRange(r); setPage(1); }} />
          <Segmented
            label="Chart"
            className="ml-auto"
            value={chart}
            onChange={(v) => setChart(v as ChartKind)}
            options={[
              { value: 'bars', label: 'Bars', icon: BarChart3 },
              { value: 'donut', label: 'Donut', icon: PieIcon },
              { value: 'trend', label: 'Trend', icon: TrendingUp },
            ]}
          />
        </div>

        {/* What's on the chart */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Showing every expense category. Pick categories, or make a group to see several categories as one.
            </p>
          ) : (
            items.map(item => {
              const color = colorOf.get(item.key);
              const name = item.kind === 'category' ? labels[String(item.categoryId)] ?? '…' : item.name;
              return (
                <span key={item.key} className="flex h-8 items-center gap-1.5 rounded-full border bg-background pr-1 pl-3 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color ?? 'var(--border)' }} />
                  {item.kind === 'group' && <Layers className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="max-w-48 truncate">{name}</span>
                  {item.kind === 'group' && (
                    <>
                      <span className="text-xs text-muted-foreground">{item.categoryIds.length}</span>
                      {item.savedId ? (
                        <BookmarkCheck className="h-3.5 w-3.5 text-primary" aria-label="Saved" />
                      ) : (
                        <IconButton label={`Save ${item.name}`} onClick={() => applyGroup(item, true, item.key)}><Bookmark /></IconButton>
                      )}
                      <IconButton label={`Edit ${item.name}`} onClick={() => setEditor({ itemKey: item.key, draft: { name: item.name, categoryIds: item.categoryIds, savedId: item.savedId } })}><Pencil /></IconButton>
                    </>
                  )}
                  <IconButton label={`Remove ${name}`} onClick={() => change(items.filter(i => i.key !== item.key))}><X /></IconButton>
                </span>
              );
            })
          )}
          {(items.length === 0 || hasSplittable) && (
            <Segmented
              label="Sub-categories"
              className="ml-auto"
              value={group}
              onChange={(v) => setGroup(v as 'main' | 'sub')}
              options={[{ value: 'main', label: 'Main categories' }, { value: 'sub', label: 'Split into sub-categories' }]}
            />
          )}
        </div>
      </div>

      {data && data.overlaps.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {data.overlaps.join(', ')} {data.overlaps.length === 1 ? 'is' : 'are'} in more than one item, so {data.overlaps.length === 1 ? 'it is' : 'they are'} counted only once — in the first item that has {data.overlaps.length === 1 ? 'it' : 'them'}.
          </span>
        </div>
      )}

      {(insights.error || history.error) && <ErrorBanner message={insights.error || history.error!} onRetry={() => { insights.reload(); history.reload(); }} />}

      {insights.loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />)}</div>
          <div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
        </div>
      ) : data && (
        <Refreshable refreshing={insights.refreshing} className="space-y-6">
          {/* Totals */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {nonZeroTotals.length === 0 ? (
              <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground shadow-xs sm:col-span-2 xl:col-span-4">Nothing in this period.</div>
            ) : (
              nonZeroTotals.map(([type, t]) => (
                <div key={type} className="rounded-xl border bg-card p-5 shadow-xs">
                  <p className="text-sm font-medium text-muted-foreground capitalize">Total {type}</p>
                  <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(t.amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t.count} transaction{t.count === 1 ? '' : 's'} · {rangeLabel(range)}</p>
                </div>
              ))
            )}
            {nonZeroTotals.length > 0 && (
              <div className="rounded-xl border bg-card p-5 shadow-xs">
                <p className="text-sm font-medium text-muted-foreground">Average per month</p>
                <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{formatCurrency(Math.round(chartTotal / monthsCount))}</p>
                <p className="mt-1 text-xs text-muted-foreground">Over {monthsCount} month{monthsCount === 1 ? '' : 's'}</p>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <ChartCard
              title={chart === 'trend' ? 'Month by month' : 'Breakdown'}
              subtitle={`${rangeLabel(range)}${mixedTypes ? ' · mixes income, expense and transfers' : ''}`}
            >
              {chart === 'bars' && <CompareBars series={series} total={chartTotal} />}
              {chart === 'donut' && <CompareDonut series={series} total={chartTotal} />}
              {chart === 'trend' && <CompareTrend series={series} months={data.months} />}
            </ChartCard>
          )}

          {rows.length > 0 && (
            <ChartCard title="Details">
              <div className="-mx-5 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Category / group</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Per month</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="pr-5 text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(r => (
                      <TableRow key={r.key}>
                        <TableCell className="pl-5">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf.get(r.key) ?? 'var(--muted-foreground)' }} />
                            {r.name}
                            {r.kind === 'group' && <Layers className="h-3.5 w-3.5 text-muted-foreground" />}
                            {r.parentName && <span className="text-xs text-muted-foreground">in {r.parentName}</span>}
                          </span>
                        </TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{r.count}</TableCell>
                        <TableCell className="tabular text-right text-muted-foreground">{formatCurrency(Math.round(r.amount / monthsCount))}</TableCell>
                        <TableCell className="tabular text-right font-medium">{formatCurrency(r.amount)}</TableCell>
                        <TableCell className="tabular pr-5 text-right text-muted-foreground">{chartTotal ? ((r.amount / chartTotal) * 100).toFixed(1) : '0.0'}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ChartCard>
          )}
        </Refreshable>
      )}

      {/* History */}
      <ChartCard
        title="History"
        subtitle={history.data ? `${history.data.total.toLocaleString()} transactions` : undefined}
        action={<Pagination page={page} totalPages={history.data?.totalPages ?? 1} onPageChange={setPage} />}
      >
        {history.loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />)}</div>
        ) : !history.data?.transactions.length ? (
          <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground"><Inbox className="h-5 w-5" /> No transactions</div>
        ) : (
          <Refreshable refreshing={history.refreshing}>
            <ul className="-mx-2 divide-y">
              {history.data.transactions.map(t => (
                <li key={t.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <TxnTypeIcon type={t.type} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{t.description || labels[String(t.categoryId)] || 'Transaction'}</span>
                        {t.isHistorical && <HistoricalBadge />}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{formatDate(t.date)} · {labels[String(t.categoryId)]} · {t.accountName}</p>
                    </div>
                  </div>
                  <TxnAmount type={t.type} amount={t.amount} className="text-sm" />
                </li>
              ))}
            </ul>
          </Refreshable>
        )}
      </ChartCard>

      {editor && (
        <GroupEditor
          initial={editor.draft}
          categories={categories}
          onApply={(draft, save) => applyGroup(draft, save, editor.itemKey)}
          onDeleteSaved={editor.draft?.savedId ? () => deleteSaved(editor.draft!.savedId!) : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5"
    >
      {children}
    </button>
  );
}

function Segmented({ label, value, onChange, options, className }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string; icon?: typeof BarChart3 }>;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex rounded-lg bg-muted p-0.5', className)}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all',
            value === o.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.icon && <o.icon className="h-4 w-4" />}
          <span className={o.icon ? 'hidden sm:inline' : undefined}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
