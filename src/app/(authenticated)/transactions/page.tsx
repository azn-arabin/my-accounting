'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency, formatDate, getTypeBadgeVariant, toPaisa, fromPaisa } from '@/lib/formatters';
import { Plus, MoreHorizontal, Pencil, Trash2, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Transaction {
  id: number;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string | null;
  date: string;
  categoryId: number;
  accountId: number;
  toAccountId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
}

interface Category {
  id: number;
  name: string;
  type: string;
  parentId: number | null;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

interface FormData {
  amount: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string;
  accountId: string;
  toAccountId: string;
  description: string;
  date: string;
}

const defaultForm: FormData = {
  amount: '',
  type: 'expense',
  categoryId: '',
  accountId: '',
  toAccountId: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [search, setSearch] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('limit', '20');
    if (filterType) params.set('type', filterType);
    if (filterCategoryId) params.set('categoryId', filterCategoryId);
    if (filterAccountId) params.set('accountId', filterAccountId);
    if (filterStartDate) params.set('startDate', filterStartDate);
    if (filterEndDate) params.set('endDate', filterEndDate);
    if (search) params.set('search', search);

    const res = await fetch(`/api/transactions?${params}`);
    const data = await res.json();
    setTransactions(data.transactions || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setLoading(false);
  }, [page, filterType, filterCategoryId, filterAccountId, filterStartDate, filterEndDate, search]);

  const fetchMeta = useCallback(async () => {
    const [catRes, accRes] = await Promise.all([
      fetch('/api/categories?flat=true'),
      fetch('/api/accounts'),
    ]);
    const catData = await catRes.json();
    const accData = await accRes.json();
    setCategories(Array.isArray(catData) ? catData : []);
    setAllAccounts(Array.isArray(accData) ? accData : []);
  }, []);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);
  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const clearFilters = () => {
    setFilterType('');
    setFilterCategoryId('');
    setFilterAccountId('');
    setFilterStartDate('');
    setFilterEndDate('');
    setSearch('');
    setPage(1);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingId(txn.id);
    setForm({
      amount: fromPaisa(txn.amount).toString(),
      type: txn.type,
      categoryId: txn.categoryId.toString(),
      accountId: txn.accountId.toString(),
      toAccountId: txn.toAccountId?.toString() || '',
      description: txn.description || '',
      date: txn.date,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.amount || !form.categoryId || !form.accountId || !form.date) return;
    setSaving(true);

    const payload = {
      amount: parseFloat(form.amount),
      type: form.type,
      categoryId: parseInt(form.categoryId),
      accountId: parseInt(form.accountId),
      toAccountId: form.type === 'transfer' && form.toAccountId ? parseInt(form.toAccountId) : null,
      description: form.description || null,
      date: form.date,
    };

    const url = editingId ? `/api/transactions/${editingId}` : '/api/transactions';
    const method = editingId ? 'PUT' : 'POST';

    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    setDialogOpen(false);
    fetchTransactions();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this transaction?')) return;
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
    fetchTransactions();
  };

  const filteredCategories = form.type
    ? categories.filter(c => c.type === form.type)
    : categories;

  // Group categories by parent for display in select
  const rootCats = filteredCategories.filter(c => c.parentId === null);
  const getChildren = (parentId: number) => filteredCategories.filter(c => c.parentId === parentId);

  const hasActiveFilters = filterType || filterCategoryId || filterAccountId || filterStartDate || filterEndDate || search;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Transaction
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={(v) => { setFilterType(v === 'all' || !v ? '' : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterAccountId} onValueChange={(v) => { setFilterAccountId(v === 'all' || !v ? '' : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="All Accounts" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              {allAccounts.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={filterStartDate}
            onChange={(e) => { setFilterStartDate(e.target.value); setPage(1); }}
            placeholder="Start Date"
          />
          <Input
            type="date"
            value={filterEndDate}
            onChange={(e) => { setFilterEndDate(e.target.value); setPage(1); }}
            placeholder="End Date"
          />
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card>
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No transactions found</p>
            <Button variant="outline" className="mt-4" onClick={openAdd}>Add your first transaction</Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="text-sm">{formatDate(txn.date)}</TableCell>
                    <TableCell className="font-medium text-sm">{txn.description || '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: txn.categoryColor || '#6b7280' }} />
                        <span className="text-sm">{txn.categoryName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{txn.accountName}</TableCell>
                    <TableCell className={`text-right font-semibold text-sm ${
                      txn.type === 'income' ? 'text-green-600 dark:text-green-400' :
                      txn.type === 'expense' ? 'text-red-600 dark:text-red-400' :
                      'text-blue-600 dark:text-blue-400'
                    }`}>
                      {txn.type === 'income' ? '+' : txn.type === 'expense' ? '-' : '↔'}
                      {formatCurrency(txn.amount)}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${getTypeBadgeVariant(txn.type)}`}>
                        {txn.type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(txn)}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(txn.id)} className="text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-muted-foreground">
                {total} transaction{total !== 1 ? 's' : ''} total
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">Page {page} of {totalPages}</span>
                <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Transaction' : 'Add Transaction'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Type Selector */}
            <div className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <Button
                  key={t}
                  variant={form.type === t ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setForm(f => ({ ...f, type: t, categoryId: '', toAccountId: '' }))}
                  className={form.type === t ? (
                    t === 'expense' ? 'bg-red-600 hover:bg-red-700' :
                    t === 'income' ? 'bg-green-600 hover:bg-green-700' :
                    'bg-blue-600 hover:bg-blue-700'
                  ) : ''}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <Label>Amount (৳)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                min="0"
                step="0.01"
                className="text-lg font-semibold"
              />
            </div>

            {/* Category */}
            <div>
              <Label>Category</Label>
              <Select value={form.categoryId} onValueChange={(v) => setForm(f => ({ ...f, categoryId: v || '' }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {rootCats.map(root => {
                    const children = getChildren(root.id);
                    if (children.length > 0) {
                      return (
                        <SelectGroup key={root.id}>
                          <SelectLabel>{root.name}</SelectLabel>
                          {children.map(child => (
                            <SelectItem key={child.id} value={child.id.toString()}>
                              {child.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    }
                    return <SelectItem key={root.id} value={root.id.toString()}>{root.name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Account */}
            <div>
              <Label>{form.type === 'transfer' ? 'From Account' : 'Account'}</Label>
              <Select value={form.accountId} onValueChange={(v) => setForm(f => ({ ...f, accountId: v || '' }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {allAccounts.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* To Account (transfer only) */}
            {form.type === 'transfer' && (
              <div>
                <Label>To Account</Label>
                <Select value={form.toAccountId} onValueChange={(v) => setForm(f => ({ ...f, toAccountId: v || '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {allAccounts.filter(a => a.id.toString() !== form.accountId).map(a => (
                      <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date */}
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>

            {/* Description */}
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="What was this for?"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Transaction'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
