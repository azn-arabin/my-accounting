import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { categories } from '@/db/schema';

/** "1,2,3" → [1, 2, 3] (invalid entries dropped). */
export function parseIds(value: string | null): number[] {
  if (!value) return [];
  return [...new Set(value.split(',').map(v => parseInt(v, 10)).filter(n => Number.isInteger(n) && n > 0))];
}

/** Selected categories plus their sub-categories (selecting "Laptop" covers "Laptop Repair" too). */
export async function withSubcategories(ids: number[]): Promise<number[]> {
  if (!ids.length) return [];
  const children = await db.select({ id: categories.id }).from(categories).where(inArray(categories.parentId, ids));
  return [...new Set([...ids, ...children.map(c => c.id)])];
}
