'use client';

import { useState } from 'react';
import { Wallet, Landmark, Smartphone, CreditCard, CircleDot, MoreHorizontal, Plus, Pencil, Trash2, Loader2, Check, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatCurrency } from '@/lib/formatters';
import { apiFetch, useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type AccountType = 'cash' | 'bank' | 'mobile_banking' | 'credit_card' | 'other';

type AccountRole = 'own' | 'receivable' | 'held';

interface Account {
  id: number;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  color: string | null;
  role: AccountRole;
  showOnDashboard: boolean;
}

const ROLE_LABELS: Record<AccountRole, string> = {
  own: 'My money',
  receivable: 'Owed to me',
  held: 'Held in trust (amanat)',
};

const ROLE_HINTS: Record<AccountRole, string> = {
  own: 'Bank, wallets and cash that belong to you',
  receivable: 'Money you lent — yours, but with someone else',
  held: "Money you keep for someone else; it's inside your accounts but not yours",
};

const typeIcons: Record<AccountType, typeof Wallet> = {
  cash: Wallet,
  bank: Landmark,
  mobile_banking: Smartphone,
  credit_card: CreditCard,
  other: CircleDot,
};

const TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  mobile_banking: 'Mobile banking',
  credit_card: 'Credit card',
  other: 'Other',
};

const SWATCHES = ['#005bea', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#0d9488', '#eab308', '#64748b'];

const emptyForm = { name: '', type: 'cash' as AccountType, balance: '', color: SWATCHES[0], role: 'own' as AccountRole, showOnDashboard: true };

export default function AccountsPage() {
  const { data, error, loading, refreshing, reload } = useApi<{ accounts: Account[] }>('/api/accounts');
  const accounts = data?.accounts ?? [];
  const sum = (role: AccountRole) => accounts.filter(a => a.role === role).reduce((s, a) => s + a.balance, 0);
  const inAccounts = sum('own');
  const heldForOthers = -sum('held');
  const owedToMe = sum('receivable');
  const myMoney = inAccounts - heldForOthers;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Account | null>(null);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (a: Account) => {
    setEditing(a);
    setForm({ name: a.name, type: a.type, balance: '', color: a.color || SWATCHES[0], role: a.role, showOnDashboard: a.showOnDashboard });
    setFormError('');
    setDialogOpen(true);
  };

  // Money held for someone is owed back, so it's stored as a negative balance
  const openingBalance = () => {
    const n = form.balance ? Math.abs(Number(form.balance)) : 0;
    return form.role === 'held' ? -n : form.role === 'receivable' ? n : Number(form.balance || 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(editing ? `/api/accounts/${editing.id}` : '/api/accounts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing
            ? { name: form.name, type: form.type, color: form.color, role: form.role, showOnDashboard: form.showOnDashboard }
            : { name: form.name, type: form.type, color: form.color, role: form.role, showOnDashboard: form.showOnDashboard, balance: openingBalance() },
        ),
      });
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleDashboard = async (a: Account) => {
    await apiFetch(`/api/accounts/${a.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showOnDashboard: !a.showOnDashboard }),
    });
    reload();
  };

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Your bank, mobile wallets and cash"
        actions={<Button onClick={openAdd}><Plus /> Add account</Button>}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted/40" />)}
        </div>
      ) : (
        <Refreshable refreshing={refreshing} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-xs sm:col-span-2 xl:col-span-1">
              <p className="text-sm font-medium text-muted-foreground">My money</p>
              <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{formatCurrency(myMoney)}</p>
              <p className="mt-1 text-xs text-muted-foreground">In accounts minus money held for others</p>
            </div>
            <MoneyTile label="In accounts" value={inAccounts} hint="Bank + wallets + cash" />
            <MoneyTile label="Held for others" value={heldForOthers} hint="Amanat inside your accounts" sign="−" />
            <MoneyTile label="Owed to me" value={owedToMe} hint={`Net worth ${formatCurrency(myMoney + owedToMe)}`} />
          </div>

          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No accounts yet</p>
                <p className="text-sm text-muted-foreground">Create one to start tracking your money.</p>
              </div>
              <Button onClick={openAdd}><Plus /> Add account</Button>
            </div>
          ) : (
            (['own', 'receivable', 'held'] as AccountRole[]).map(role => {
              const group = accounts.filter(a => a.role === role);
              if (!group.length) return null;
              return (
                <section key={role} className="space-y-3">
                  <div>
                    <h2 className="text-sm font-semibold">{ROLE_LABELS[role]}</h2>
                    <p className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.map((a) => {
                      const Icon = typeIcons[a.type] || Wallet;
                      const color = a.color || 'var(--muted-foreground)';
                      return (
                        <div key={a.id} className={cn('group relative overflow-hidden rounded-xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md', !a.showOnDashboard && 'opacity-75')}>
                          <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: color }} />
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                                style={{ backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`, color }}
                              >
                                <Icon className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium">{a.name}</p>
                                <p className="text-xs text-muted-foreground">{TYPE_LABELS[a.type]}</p>
                              </div>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Actions" className="opacity-60 group-hover:opacity-100 data-popup-open:opacity-100" />}>
                                <MoreHorizontal />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => openEdit(a)}><Pencil /> Edit</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => toggleDashboard(a)}>
                                  {a.showOnDashboard ? <><EyeOff /> Hide from dashboard</> : <><Eye /> Show on dashboard</>}
                                </DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(a)}><Trash2 /> Delete</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <p className={cn('tabular mt-5 text-2xl font-semibold tracking-tight', a.balance < 0 && role !== 'held' && 'text-destructive')}>
                            {role === 'held' ? formatCurrency(Math.abs(a.balance)) : formatCurrency(a.balance)}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            {role === 'held' && 'Kept for them · '}
                            {role === 'receivable' && 'They owe you · '}
                            {a.showOnDashboard ? 'On dashboard' : 'Hidden from dashboard'}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </Refreshable>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit account' : 'Add account'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" placeholder="e.g. BRAC Bank" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select items={TYPE_LABELS} value={form.type} onValueChange={(v) => setForm({ ...form, type: (v as AccountType) || 'cash' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as AccountType[]).map((t) => {
                    const Icon = typeIcons[t];
                    return <SelectItem key={t} value={t}><Icon className="text-muted-foreground" /> {TYPE_LABELS[t]}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>

            {!editing && (
              <div className="space-y-2">
                <Label htmlFor="acc-balance">{form.role === 'held' ? 'Amount you are keeping (৳)' : form.role === 'receivable' ? 'Amount they owe you (৳)' : 'Opening balance (৳)'}</Label>
                <Input id="acc-balance" type="number" step="0.01" inputMode="decimal" placeholder="0.00" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
              </div>
            )}

            <div className="space-y-2">
              <Label>This account is</Label>
              <Select items={ROLE_LABELS} value={form.role} onValueChange={(v) => setForm({ ...form, role: (v as AccountRole) || 'own' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as AccountRole[]).map(r => (
                    <SelectItem key={r} value={r}>
                      <span className="flex flex-col">
                        <span>{ROLE_LABELS[r]}</span>
                        <span className="text-xs font-normal text-muted-foreground">{ROLE_HINTS[r]}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
              <span className="text-sm">
                Show on dashboard
                <span className="block text-xs text-muted-foreground">Totals always include every account</span>
              </span>
              <Switch checked={form.showOnDashboard} onCheckedChange={(v) => setForm({ ...form, showOnDashboard: v })} />
            </label>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm({ ...form, color: c })}
                    className="flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    aria-pressed={form.color === c}
                  >
                    {form.color === c && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            {formError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? 'Save changes' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'account'}?`}
        description="The account is hidden from lists; its past transactions are kept."
        onConfirm={async () => {
          await apiFetch(`/api/accounts/${deleting!.id}`, { method: 'DELETE' });
          reload();
        }}
      />
    </>
  );
}

function MoneyTile({ label, value, hint, sign }: { label: string; value: number; hint: string; sign?: string }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-xs">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold tracking-tight">{sign && value ? sign : ''}{formatCurrency(value)}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
