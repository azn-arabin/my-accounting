export type CategoryType = 'income' | 'expense' | 'transfer';

export interface CategoryLite {
  id: number;
  name: string;
  type: CategoryType;
  parentId: number | null;
  color?: string | null;
  txnCount?: number;
}

/** "Laptop › Laptop Repair" for sub-categories, plain name for top level. */
export function categoryLabel(c: CategoryLite, byId: Map<number, CategoryLite>): string {
  const parent = c.parentId ? byId.get(c.parentId) : undefined;
  return parent ? `${parent.name} › ${c.name}` : c.name;
}

/** id → label map for Select `items`. */
export function categoryItems(list: CategoryLite[]): Record<string, string> {
  const byId = new Map(list.map(c => [c.id, c]));
  return Object.fromEntries(list.map(c => [String(c.id), categoryLabel(c, byId)]));
}

/** Parents followed by their children, per type — the order every picker shows. */
export function categoryTree(list: CategoryLite[], type?: CategoryType) {
  const scoped = type ? list.filter(c => c.type === type) : list;
  return scoped
    .filter(c => c.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(root => ({ ...root, children: scoped.filter(c => c.parentId === root.id).sort((a, b) => a.name.localeCompare(b.name)) }));
}

export const TYPE_LABELS: Record<CategoryType, string> = { expense: 'Expense', income: 'Income', transfer: 'Transfer' };
