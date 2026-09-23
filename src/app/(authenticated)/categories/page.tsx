'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CornerDownRight, Pencil, Plus, Trash2, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiFetch, useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';

type CategoryType = 'income' | 'expense' | 'transfer';

interface Category {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  icon: string | null;
  color: string | null;
}

interface CategoryNode extends Category {
  children: CategoryNode[];
}

const TYPE_LABELS: Record<CategoryType, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };
const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#10b981', '#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

export default function CategoriesPage() {
  const { data, error, loading, refreshing, reload } = useApi<Category[]>('/api/categories?flat=true');
  const categories = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const [collapsed, setCollapsed] = useState<Record<CategoryType, boolean>>({ expense: false, income: false, transfer: false });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'expense' as CategoryType, parentId: 'none', color: SWATCHES[0] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);

  const trees = useMemo(() => {
    const map = new Map<number, CategoryNode>(categories.map(c => [c.id, { ...c, children: [] }]));
    const roots: CategoryNode[] = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    return {
      expense: roots.filter(c => c.type === 'expense'),
      income: roots.filter(c => c.type === 'income'),
      transfer: roots.filter(c => c.type === 'transfer'),
    };
  }, [categories]);

  const openAdd = (type: CategoryType = 'expense', parentId?: number) => {
    setEditing(null);
    setForm({ name: '', type, parentId: parentId ? String(parentId) : 'none', color: SWATCHES[0] });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type, parentId: c.parentId ? String(c.parentId) : 'none', color: c.color || SWATCHES[0] });
    setFormError('');
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await apiFetch(editing ? `/api/categories/${editing.id}` : '/api/categories', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          type: form.type,
          parentId: form.parentId === 'none' ? null : Number(form.parentId),
          color: form.color,
        }),
      });
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // Only top-level categories of the same type can be parents (one level of nesting)
  const parentItems = useMemo(() => {
    const items: Record<string, string> = { none: 'None (top level)' };
    for (const c of categories) {
      if (c.type === form.type && c.parentId === null && c.id !== editing?.id) items[String(c.id)] = c.name;
    }
    return items;
  }, [categories, form.type, editing]);

  const Row = ({ node, child = false }: { node: CategoryNode; child?: boolean }) => (
    <div className={cn('group flex items-center justify-between gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50', child && 'pl-9')}>
      <div className="flex min-w-0 items-center gap-2.5">
        {child && <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.color || 'var(--muted-foreground)' }} />
        <span className={cn('truncate text-sm', !child && 'font-medium')}>{node.name}</span>
        {!child && node.children.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{node.children.length}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!child && (
          <Button variant="ghost" size="icon-sm" onClick={() => openAdd(node.type, node.id)} aria-label={`Add sub-category to ${node.name}`} title="Add sub-category">
            <Plus />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(node)} aria-label={`Edit ${node.name}`} title="Edit"><Pencil /></Button>
        <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => setDeleting(node)} aria-label={`Delete ${node.name}`} title="Delete">
          <Trash2 />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group your income, expenses and transfers"
        actions={<Button onClick={() => openAdd()}><Plus /> Add category</Button>}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading ? (
        <div className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/40" />)}</div>
      ) : (
        <Refreshable refreshing={refreshing} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(['expense', 'income', 'transfer'] as const).map((type) => {
            const nodes = trees[type];
            const count = categories.filter(c => c.type === type).length;
            const isCollapsed = collapsed[type];
            return (
              <section key={type} className={cn('rounded-xl border bg-card shadow-xs', type === 'expense' && 'lg:row-span-2')}>
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-semibold"
                    onClick={() => setCollapsed(c => ({ ...c, [type]: !c[type] }))}
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isCollapsed && '-rotate-90')} />
                    {TYPE_LABELS[type]}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{count}</span>
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => openAdd(type)}><Plus /> Add</Button>
                </div>
                {!isCollapsed && (
                  <div className="p-2">
                    {nodes.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">No {type} categories yet.</p>
                    ) : (
                      nodes.map((node) => (
                        <div key={node.id}>
                          <Row node={node} />
                          {node.children.map((child) => <Row key={child.id} node={child} child />)}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </Refreshable>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) setDialogOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit category' : 'Add category'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Groceries" required autoFocus />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  items={TYPE_LABELS}
                  value={form.type}
                  onValueChange={(v) => setForm({ ...form, type: (v as CategoryType) || 'expense', parentId: 'none' })}
                  disabled={!!editing}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABELS) as CategoryType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Parent</Label>
                <Select items={parentItems} value={form.parentId} onValueChange={(v) => setForm({ ...form, parentId: (v as string) || 'none' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {Object.entries(parentItems).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

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
              <Button type="submit" disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? 'Save changes' : 'Add category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        description="It and its sub-categories are hidden from new entries; existing transactions keep their category."
        onConfirm={async () => {
          await apiFetch(`/api/categories/${deleting!.id}`, { method: 'DELETE' });
          reload();
        }}
      />
    </>
  );
}
