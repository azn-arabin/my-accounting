'use client';

import { useState } from 'react';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CategoryMultiSelect } from '@/components/category-multi-select';
import type { CategoryLite } from '@/lib/categories';
import { cn } from '@/lib/utils';

export interface GroupDraft {
  name: string;
  categoryIds: number[];
  savedId?: number;
}

/**
 * Build (or edit) a group of categories that charts show as one series. Saving is optional:
 * unsaved groups live only on this page until you leave it.
 */
export function GroupEditor({
  initial,
  categories,
  onApply,
  onDeleteSaved,
  onClose,
}: {
  initial?: GroupDraft;
  categories: CategoryLite[];
  /** save=true → create/update the saved group too */
  onApply: (draft: GroupDraft, save: boolean) => Promise<void>;
  onDeleteSaved?: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ids, setIds] = useState<number[]>(initial?.categoryIds ?? []);
  const [save, setSave] = useState(!!initial?.savedId);
  const [busy, setBusy] = useState<'apply' | 'delete' | null>(null);
  const [error, setError] = useState('');

  const run = async (kind: 'apply' | 'delete', fn: () => Promise<void>) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setBusy(null);
    }
  };

  const valid = name.trim() && ids.length > 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit group' : 'New group'}</DialogTitle>
          <DialogDescription>The chosen categories are added up and shown as one slice / line.</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (valid) run('apply', () => onApply({ name: name.trim(), categoryIds: ids, savedId: initial?.savedId }, save)); }}
        >
          <div className="space-y-2">
            <Label htmlFor="group-name">Name</Label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home setup" autoFocus required />
          </div>

          <div className="space-y-2">
            <Label>Categories</Label>
            <CategoryMultiSelect categories={categories} value={ids} onChange={setIds} className="w-full" />
            <p className="text-xs text-muted-foreground">Main or sub-categories. Choosing a main category includes its sub-categories.</p>
          </div>

          <button type="button" role="checkbox" aria-checked={save} onClick={() => setSave(s => !s)} className="flex items-start gap-2.5 text-left text-sm">
            <span className={cn('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors', save ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>
              {save && <Check className="h-3 w-3" />}
            </span>
            <span>
              {initial?.savedId ? 'Update the saved group' : 'Save for later'}
              <span className="block text-xs text-muted-foreground">
                {save ? 'It will be in “Saved groups” next time.' : 'Only for now — gone when you leave this page.'}
              </span>
            </span>
          </button>

          {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          <DialogFooter className="sm:justify-between">
            {initial?.savedId && onDeleteSaved ? (
              <Button type="button" variant="destructive" onClick={() => run('delete', onDeleteSaved)} disabled={!!busy}>
                {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete saved group
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={!!busy}>Cancel</Button>
              <Button type="submit" disabled={!valid || !!busy}>
                {busy === 'apply' && <Loader2 className="animate-spin" />}
                {initial ? 'Apply' : 'Add to chart'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
