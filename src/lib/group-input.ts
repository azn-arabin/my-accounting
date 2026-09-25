import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { categories } from '@/db/schema';

/** Validate a saved group's name and category list. */
export async function validateGroupInput(body: { name?: unknown; categoryIds?: unknown }, partial = false) {
  const out: { name?: string; categoryIds?: number[] } = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'Give the group a name' };
    if (name.length > 100) return { error: 'Name is too long (max 100 characters)' };
    out.name = name;
  }

  if (body.categoryIds !== undefined || !partial) {
    const ids = Array.isArray(body.categoryIds)
      ? [...new Set(body.categoryIds.filter((i): i is number => Number.isInteger(i) && i > 0))]
      : [];
    if (ids.length < 1) return { error: 'Pick at least one category' };
    const found = await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, ids));
    if (found.length !== ids.length) return { error: 'Some categories no longer exist' };
    out.categoryIds = ids;
  }

  return { data: out };
}
