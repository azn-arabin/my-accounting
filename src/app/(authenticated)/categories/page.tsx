'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Loader2, Check, MoveRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CategoryPicker } from '@/components/category-picker';
import { apiFetch, useApi } from '@/lib/use-api';
import { cn } from '@/lib/utils';
import {
  ancestorsOf, branchHeight, depthOf, descendantIds, MAX_CATEGORY_DEPTH, nestTree, TYPE_LABELS,
  type CategoryLite, type CategoryNode, type CategoryType,
} from '@/lib/categories';

interface Category extends CategoryLite {
  icon: string | null;
  color: string | null;
  txnCount: number;
}

type Node = CategoryNode<Category> & Category;

const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#10b981', '#0d9488', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];

/** Transactions in a category and everything below it. */
const branchCount = (n: Node): number => n.txnCount + n.children.reduce((s, c) => s + branchCount(c), 0);

export default function CategoriesPage() {
  const { data, error, loading, refreshing, reload } = useApi<Category[]>('/api/categories?flat=true');
  const categories = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const [collapsedTypes, setCollapsedTypes] = useState<Record<CategoryType, boolean>>({ expense: false, income: false, transfer: false });
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', type: 'expense' as CategoryType, parentId: null as number | null, color: SWATCHES[0] });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [moving, setMoving] = useState<Node | null>(null);
  const [message, setMessage] = useState('');

  const trees = useMemo(() => ({
    expense: nestTree(categories, 'expense'),
    income: nestTree(categories, 'income'),
    transfer: nestTree(categories, 'transfer'),
  }), [categories]);

  const openAdd = (type: CategoryType = 'expense', parentId: number | null = null) => {
    setEditing(null);
    setForm({ name: '', type, parentId, color: parentId ? byId.get(parentId)?.color || SWATCHES[0] : SWATCHES[0] });
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, type: c.type, parentId: c.parentId, color: c.color || SWATCHES[0] });
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
        body: JSON.stringify({ name: form.name.trim(), type: form.type, parentId: form.parentId, color: form.color }),
      });
      setDialogOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // A parent is allowed if it's not inside the edited category's own branch and the branch still fits in 5 levels
  const ownBranch = useMemo(() => (editing ? new Set([editing.id, ...descendantIds(editing.id, categories)]) : new Set<number>()), [editing, categories]);
  const height = editing ? branchHeight(editing.id, categories) : 1;
  const parentDisabled = (c: CategoryLite) => ownBranch.has(c.id) || depthOf(c, byId) + height > MAX_CATEGORY_DEPTH;
  const toggleFold = (id: number) => setFolded(f => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <>
      <PageHeader
        title="Categories"
        description={`Group your income, expenses and transfers — up to ${MAX_CATEGORY_DEPTH} levels deep`}
        actions={<Button onClick={() => openAdd()}><Plus /> Add category</Button>}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}
      {message && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg bg-success/10 px-4 py-2.5 text-sm text-success">
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/40" />)}</div>
      ) : (
        <Refreshable refreshing={refreshing} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {(['expense', 'income', 'transfer'] as const).map((type) => {
            const nodes = trees[type] as Node[];
            const count = categories.filter(c => c.type === type).length;
            const isCollapsed = collapsedTypes[type];
            return (
              <section key={type} className={cn('rounded-xl border bg-card shadow-xs', type === 'expense' && 'lg:row-span-2')}>
                <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-sm font-semibold"
                    onClick={() => setCollapsedTypes(c => ({ ...c, [type]: !c[type] }))}
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
                        <CategoryRow
                          key={node.id}
                          node={node}
                          folded={folded}
                          onToggle={toggleFold}
                          onAdd={(n) => openAdd(n.type, n.id)}
                          onMove={setMoving}
                          onEdit={openEdit}
                          onDelete={setDeleting}
                        />
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
              <Input id="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Office travel" required autoFocus />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                items={TYPE_LABELS}
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: (v as CategoryType) || 'expense', parentId: null })}
                disabled={!!editing}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as CategoryType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Inside</Label>
              <CategoryPicker
                categories={categories}
                type={form.type}
                value={form.parentId}
                onChange={(id) => setForm({ ...form, parentId: id })}
                allLabel="Nothing (top level)"
                isDisabled={parentDisabled}
                aria-label="Parent category"
              />
              <p className="text-xs text-muted-foreground">
                Greyed-out choices would put it inside itself or go deeper than {MAX_CATEGORY_DEPTH} levels.
              </p>
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

      {moving && (
        <MoveDialog
          source={moving}
          categories={categories}
          onClose={() => setMoving(null)}
          onMoved={(text) => { setMoving(null); setMessage(text); reload(); }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'category'}?`}
        description="It and every category inside it are hidden from new entries; existing transactions keep their category."
        onConfirm={async () => {
          await apiFetch(`/api/categories/${deleting!.id}`, { method: 'DELETE' });
          reload();
        }}
      />
    </>
  );
}

function CategoryRow({ node, folded, onToggle, onAdd, onMove, onEdit, onDelete }: {
  node: Node;
  folded: Set<number>;
  onToggle: (id: number) => void;
  onAdd: (n: Node) => void;
  onMove: (n: Node) => void;
  onEdit: (n: Node) => void;
  onDelete: (n: Node) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isFolded = folded.has(node.id);
  const total = branchCount(node);
  return (
    <>
      <div
        className="group flex items-center justify-between gap-3 rounded-lg py-1.5 pr-2 transition-colors hover:bg-muted/50"
        style={{ paddingLeft: `${0.25 + (node.depth - 1) * 1.25}rem` }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {hasChildren ? (
            <button type="button" onClick={() => onToggle(node.id)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted" aria-label={isFolded ? `Expand ${node.name}` : `Collapse ${node.name}`} aria-expanded={!isFolded}>
              {isFolded ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: node.color || 'var(--muted-foreground)' }} />
          <span className={cn('truncate text-sm', node.depth === 1 && 'font-medium')}>{node.name}</span>
          {total > 0 && (
            <span className="tabular text-xs text-muted-foreground" title={hasChildren ? 'Transactions here and below' : 'Transactions'}>{total}</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {node.depth < MAX_CATEGORY_DEPTH && (
            <Button variant="ghost" size="icon-sm" onClick={() => onAdd(node)} aria-label={`Add a category inside ${node.name}`} title="Add sub-category">
              <Plus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" onClick={() => onMove(node)} disabled={total === 0} aria-label={`Move transactions from ${node.name}`} title="Move its transactions to another category">
            <MoveRight />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(node)} aria-label={`Edit ${node.name}`} title="Edit"><Pencil /></Button>
          <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" onClick={() => onDelete(node)} aria-label={`Delete ${node.name}`} title="Delete">
            <Trash2 />
          </Button>
        </div>
      </div>
      {hasChildren && !isFolded && node.children.map(child => (
        <CategoryRow key={child.id} node={child} folded={folded} onToggle={onToggle} onAdd={onAdd} onMove={onMove} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

function MoveDialog({ source, categories, onClose, onMoved }: {
  source: Node;
  categories: Category[];
  onClose: () => void;
  onMoved: (message: string) => void;
}) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const hasBelow = source.children.length > 0;
  const [includeSubs, setIncludeSubs] = useState(hasBelow);
  const [removeSource, setRemoveSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const belowCount = branchCount(source) - source.txnCount;
  const count = source.txnCount + (includeSubs ? belowCount : 0);
  const byId = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const pathOf = (id: number) => {
    const c = byId.get(id);
    return c ? [...ancestorsOf(c, byId).map(a => a.name), c.name].join(' › ') : '';
  };

  const submit = async () => {
    if (!targetId) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ moved: number }>(`/api/categories/${source.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, includeSubcategories: includeSubs, deactivateSource: removeSource }),
      });
      onMoved(`Moved ${res.moved} transaction${res.moved === 1 ? '' : 's'} from ${source.name} to ${pathOf(targetId)}${removeSource ? ` and removed ${source.name}` : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not move');
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move transactions from “{source.name}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Only the category changes — amounts, dates and account balances stay exactly the same.</p>

          <div className="space-y-2">
            <Label>Move to</Label>
            <CategoryPicker
              categories={categories}
              type={source.type}
              value={targetId}
              onChange={setTargetId}
              isDisabled={(c) => c.id === source.id}
              aria-label="Target category"
            />
          </div>

          {hasBelow && (
            <Toggle checked={includeSubs} onChange={setIncludeSubs}>
              Also move the transactions of every category inside it ({belowCount})
            </Toggle>
          )}
          <Toggle checked={removeSource} onChange={setRemoveSource}>
            Remove “{source.name}” afterwards
            {hasBelow && !includeSubs ? ' (the categories inside it move up one level)' : ''}
          </Toggle>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !targetId}>
            {busy && <Loader2 className="animate-spin" />}
            Move {count} transaction{count === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start gap-2.5 text-left text-sm">
      <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
        {checked && <Check className="h-3 w-3" />}
      </span>
      <span>{children}</span>
    </button>
  );
}
