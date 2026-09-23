'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Search, X, ChevronLeft, ChevronRight, Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { TxnAmount, TxnTypeIcon, HistoricalBadge, type TxnType } from '@/components/txn-bits';
import { formatCurrency, formatDate, fromPaisa } from '@/lib/formatters';
import { useHistoricalMode } from '@/lib/use-historical-mode';
import { apiFetch, useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

interface Transaction {
  id: number;
  amount: number;
  type: TxnType;
  description: string | null;
  date: string;
  categoryId: number;
  accountId: number;
  toAccountId: number | null;
  categoryName: string | null;
  accountName: string | null;
  isHistorical: boolean;
}

interface Category { id: number; name: string; type: TxnType; parentId: number | null }
interface Account { id: number; name: string; type: string }

interface FormData {
  amount: string;
  type: TxnType;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  description: string;
  date: string;
}

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const emptyForm = (): FormData => ({ amount: '', type: 'expense', categoryId: '', accountId: '', toAccountId: '', description: '', date: today() });

const TYPE_ITEMS: Record<string, string> = { all: 'All types', income: 'Income', expense: 'Expense', transfer: 'Transfer' };
const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const { mode } = useHistoricalMode();

  // Filters
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('all');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [filterAccountId, setFilterAccountId] = useState('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the search box so typing doesn't fire a request per key
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listUrl = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), historical: mode });
    if (filterType !== 'all') p.set('type', filterType);
    if (filterCategoryId !== 'all') p.set('categoryId', filterCategoryId);
    if (filterAccountId !== 'all') p.set('accountId', filterAccountId);
    if (filterStartDate) p.set('startDate', filterStartDate);
    if (filterEndDate) p.set('endDate', filterEndDate);
    if (search) p.set('search', search);
    return `/api/transactions?${p}`;
  }, [page, mode, filterType, filterCategoryId, filterAccountId, filterStartDate, filterEndDate, search]);

  const list = useApi<{ transactions: Transaction[]; total: number; totalPages: number }>(listUrl);
  const cats = useApi<Category[]>('/api/categories?flat=true');
  const accs = useApi<{ accounts: Account[] }>('/api/accounts');
  const categories = useMemo(() => (Array.isArray(cats.data) ? cats.data : []), [cats.data]);
  const accounts = useMemo(() => accs.data?.accounts ?? [], [accs.data]);

  const categoryItems = useMemo(() => Object.fromEntries(categories.map(c => [String(c.id), c.name])), [categories]);
  const accountItems = useMemo(() => Object.fromEntries(accounts.map(a => [String(a.id), a.name])), [accounts]);

  const hasActiveFilters = filterType !== 'all' || filterCategoryId !== 'all' || filterAccountId !== 'all' || filterStartDate || filterEndDate || searchInput;
  const clearFilters = () => {
    setFilterType('all');
    setFilterCategoryId('all');
    setFilterAccountId('all');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearchInput('');
    setPage(1);
  };

  // Add / edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingId(txn.id);
    setForm({
      amount: fromPaisa(txn.amount).toString(),
      type: txn.type,
      categoryId: String(txn.categoryId),
      accountId: String(txn.accountId),
      toAccountId: txn.toAccountId ? String(txn.toAccountId) : '',
      description: txn.description || '',
      date: txn.date,
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(editingId ? `/api/transactions/${editingId}` : '/api/transactions', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          type: form.type,
          categoryId: form.categoryId ? parseInt(form.categoryId) : null,
          accountId: form.accountId ? parseInt(form.accountId) : null,
          toAccountId: form.type === 'transfer' && form.toAccountId ? parseInt(form.toAccountId) : null,
          description: form.description || null,
          date: form.date,
        }),
      });
      setDialogOpen(false);
      list.reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const formCategories = categories.filter(c => c.type === form.type);
  const rootCats = formCategories.filter(c => c.parentId === null);
  const childrenOf = (id: number) => formCategories.filter(c => c.parentId === id);

  const txns = list.data?.transactions ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(list.data?.totalPages ?? 1, 1);

  return (
    <>
      <PageHeader
        title="Transactions"
        description={list.data ? `${total.toLocaleString()} transaction${total === 1 ? '' : 's'}` : 'Every income, expense and transfer'}
        actions={<Button onClick={openAdd}><Plus /> Add transaction</Button>}
      />

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-3 shadow-xs sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))_auto_auto_auto]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search description…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
        </div>
        <Select items={TYPE_ITEMS} value={filterType} onValueChange={(v) => { setFilterType((v as string) || 'all'); setPage(1); }}>
          <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_ITEMS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select items={{ all: 'All categories', ...categoryItems }} value={filterCategoryId} onValueChange={(v) => { setFilterCategoryId((v as string) || 'all'); setPage(1); }}>
          <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">All categories</SelectItem>
            {(['expense', 'income', 'transfer'] as const).map(t => {
              const group = categories.filter(c => c.type === t);
              if (!group.length) return null;
              return (
                <SelectGroup key={t}>
                  <SelectLabel className="capitalize">{t}</SelectLabel>
                  {group.map(c => (
                    <SelectItem key={c.id} value={String(c.id)} className={c.parentId ? 'pl-5' : undefined}>{c.name}</SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
        <Select items={{ all: 'All accounts', ...accountItems }} value={filterAccountId} onValueChange={(v) => { setFilterAccountId((v as string) || 'all'); setPage(1); }}>
          <SelectTrigger aria-label="Account"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="From date" value={filterStartDate} onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }} />
        <Input type="date" aria-label="To date" value={filterEndDate} onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }} />
        <Button variant="ghost" onClick={clearFilters} disabled={!hasActiveFilters} className={cn(!hasActiveFilters && 'invisible')}>
          <X /> Clear
        </Button>
      </div>

      {list.error && <ErrorBanner message={list.error} onRetry={list.reload} />}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {list.loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }, (_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-muted/50" />)}
          </div>
        ) : txns.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted"><Inbox className="h-5 w-5 text-muted-foreground" /></span>
            <div>
              <p className="font-medium">No transactions found</p>
              <p className="text-sm text-muted-foreground">{hasActiveFilters ? 'Try clearing the filters.' : 'Add your first transaction to get started.'}</p>
            </div>
            {hasActiveFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : <Button onClick={openAdd}><Plus /> Add transaction</Button>}
          </div>
        ) : (
          <Refreshable refreshing={list.refreshing}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-28 pl-4">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-12 pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txns.map((txn) => (
                    <TableRow key={txn.id} className="group">
                      <TableCell className="pl-4 text-sm whitespace-nowrap text-muted-foreground">{formatDate(txn.date)}</TableCell>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <TxnTypeIcon type={txn.type} className="h-7 w-7" />
                          <span className="max-w-[28ch] truncate text-sm font-medium">{txn.description || '—'}</span>
                          {txn.isHistorical && <HistoricalBadge />}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{txn.categoryName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {txn.accountName}
                        {txn.type === 'transfer' && txn.toAccountId && accountItems[String(txn.toAccountId)] && (
                          <> → {accountItems[String(txn.toAccountId)]}</>
                        )}
                      </TableCell>
                      <TableCell className="text-right"><TxnAmount type={txn.type} amount={txn.amount} className="text-sm" /></TableCell>
                      <TableCell className="pr-4">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" className="opacity-60 group-hover:opacity-100 data-popup-open:opacity-100" />}>
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(txn)}><Pencil /> Edit</DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(txn)}><Trash2 /> Delete</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
              <p className="text-muted-foreground">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
                <span className="tabular min-w-20 text-center text-muted-foreground">Page {page} / {totalPages}</span>
                <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} aria-label="Next page"><ChevronRight /></Button>
              </div>
            </div>
          </Refreshable>
        )}
      </div>

      {/* Add / edit */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit transaction' : 'Add transaction'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            {/* Type segmented control */}
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Type">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={form.type === t}
                  onClick={() => setForm(f => ({ ...f, type: t, categoryId: '', toAccountId: '' }))}
                  className={cn(
                    'rounded-md py-1.5 text-sm font-medium capitalize transition-all',
                    form.type === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="txn-amount">Amount (৳)</Label>
              <Input
                id="txn-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                min="0.01"
                step="0.01"
                required
                autoFocus
                className="h-11 text-lg font-semibold"
              />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select items={categoryItems} value={form.categoryId || null} onValueChange={(v) => setForm(f => ({ ...f, categoryId: (v as string) || '' }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {rootCats.map(root => {
                    const kids = childrenOf(root.id);
                    return kids.length ? (
                      <SelectGroup key={root.id}>
                        <SelectLabel>{root.name}</SelectLabel>
                        <SelectItem value={String(root.id)}>{root.name} (general)</SelectItem>
                        {kids.map(child => <SelectItem key={child.id} value={String(child.id)} className="pl-5">{child.name}</SelectItem>)}
                      </SelectGroup>
                    ) : (
                      <SelectItem key={root.id} value={String(root.id)}>{root.name}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className={cn('grid gap-4', form.type === 'transfer' && 'sm:grid-cols-2')}>
              <div className="space-y-2">
                <Label>{form.type === 'transfer' ? 'From account' : 'Account'}</Label>
                <Select items={accountItems} value={form.accountId || null} onValueChange={(v) => setForm(f => ({ ...f, accountId: (v as string) || '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.type === 'transfer' && (
                <div className="space-y-2">
                  <Label>To account</Label>
                  <Select items={accountItems} value={form.toAccountId || null} onValueChange={(v) => setForm(f => ({ ...f, toAccountId: (v as string) || '' }))}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter(a => String(a.id) !== form.accountId).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="txn-date">Date</Label>
              <Input id="txn-date" type="date" value={form.date} onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="txn-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea id="txn-desc" placeholder="What was this for?" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>

            {formError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editingId ? 'Save changes' : 'Add transaction'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this transaction?"
        description={deleting && (
          <>
            {deleting.description || deleting.categoryName} · {formatCurrency(deleting.amount)} on {formatDate(deleting.date)}. The account balance will be adjusted.
          </>
        )}
        onConfirm={async () => {
          await apiFetch(`/api/transactions/${deleting!.id}`, { method: 'DELETE' });
          list.reload();
        }}
      />
    </>
  );
}
