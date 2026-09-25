export type CategoryType = 'income' | 'expense' | 'transfer';

/** Categories can nest this many levels deep (1 = top level). */
export const MAX_CATEGORY_DEPTH = 5;

export interface CategoryLite {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  color?: string | null;
  txnCount?: number;
}

export const TYPE_LABELS: Record<CategoryType, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);

/** Root → … → parent (not including the category itself). Stops on broken links or cycles. */
export function ancestorsOf<T extends Pick<CategoryLite, 'id' | 'parentId'>>(c: T, byId: Map<number, T>): T[] {
  const out: T[] = [];
  const seen = new Set([c.id]);
  let p = c.parentId ? byId.get(c.parentId) : undefined;
  while (p && !seen.has(p.id)) {
    out.unshift(p);
    seen.add(p.id);
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return out;
}

/** 1 for a top-level category. */
export function depthOf<T extends Pick<CategoryLite, 'id' | 'parentId'>>(c: T, byId: Map<number, T>) {
  return ancestorsOf(c, byId).length + 1;
}

/** Every category below `id`, at any depth. */
export function descendantIds(id: number, list: Array<Pick<CategoryLite, 'id' | 'parentId'>>): number[] {
  const out: number[] = [];
  const queue = [id];
  const seen = new Set([id]);
  while (queue.length) {
    const cur = queue.shift()!;
    for (const c of list) {
      if (c.parentId === cur && !seen.has(c.id)) {
        seen.add(c.id);
        out.push(c.id);
        queue.push(c.id);
      }
    }
  }
  return out;
}

/** Levels in the branch starting at `id` (1 = no children). */
export function branchHeight(id: number, list: Array<Pick<CategoryLite, 'id' | 'parentId'>>): number {
  const kids = list.filter(c => c.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map(k => branchHeight(k.id, list))) : 0);
}

/** Full path: "Daily Expense › Travel › Office". */
export function categoryLabel(c: CategoryLite, byId: Map<number, CategoryLite>): string {
  return [...ancestorsOf(c, byId).map(a => a.name), c.name].join(' › ');
}

/** id → full-path label, for Select `items`. */
export function categoryItems(list: CategoryLite[]): Record<string, string> {
  const byId = new Map(list.map(c => [c.id, c]));
  return Object.fromEntries(list.map(c => [String(c.id), categoryLabel(c, byId)]));
}

export interface FlatCategory extends CategoryLite {
  depth: number; // 1 = top level
  hasChildren: boolean;
  path: string;
}

/** Depth-first list (parents before children, alphabetical) — the order every picker shows. */
export function flattenCategories(list: CategoryLite[], type?: CategoryType): FlatCategory[] {
  const scoped = type ? list.filter(c => c.type === type) : list;
  const ids = new Set(scoped.map(c => c.id));
  const out: FlatCategory[] = [];
  const walk = (parentId: number | null, depth: number, prefix: string) => {
    const level = scoped.filter(c => (parentId === null ? c.parentId === null || !ids.has(c.parentId) : c.parentId === parentId)).sort(byName);
    for (const c of level) {
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      const hasChildren = scoped.some(x => x.parentId === c.id);
      out.push({ ...c, depth, hasChildren, path });
      if (hasChildren && depth < 50) walk(c.id, depth + 1, path);
    }
  };
  walk(null, 1, '');
  return out;
}

export interface CategoryNode<T extends CategoryLite = CategoryLite> extends CategoryLite {
  depth: number;
  children: Array<CategoryNode<T> & T>;
}

/** Nested tree (any depth) of one type. */
export function nestTree<T extends CategoryLite>(list: T[], type?: CategoryType): Array<CategoryNode<T> & T> {
  const scoped = type ? list.filter(c => c.type === type) : list;
  const ids = new Set(scoped.map(c => c.id));
  const build = (parentId: number | null, depth: number): Array<CategoryNode<T> & T> =>
    scoped
      .filter(c => (parentId === null ? c.parentId === null || !ids.has(c.parentId) : c.parentId === parentId))
      .sort(byName)
      .map(c => ({ ...c, depth, children: depth < 50 ? build(c.id, depth + 1) : [] }));
  return build(null, 1);
}
