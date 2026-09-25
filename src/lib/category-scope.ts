import { db } from '@/db';
import { categories } from '@/db/schema';
import { descendantIds } from '@/lib/categories';

/** "1,2,3" → [1, 2, 3] (invalid entries dropped). */
export function parseIds(value: string | null): number[] {
  if (!value) return [];
  return [...new Set(value.split(',').map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0))];
}

/** Every category's id and parent — small table, loaded whole for tree walks. */
export async function categoryLinks() {
  return db.select({ id: categories.id, parentId: categories.parentId }).from(categories);
}

/** Selected categories plus everything below them, at any depth ("Daily Expense" covers "Travel › Office"). */
export async function withSubcategories(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const links = await categoryLinks();
  return [...new Set(ids.flatMap(id => [id, ...descendantIds(id, links)]))];
}
