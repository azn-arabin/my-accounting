import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { accounts, categories, transactions } from '@/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

/**
 * Re-categorize many transactions at once. Only the category changes, so balances are untouched.
 * Body: { ids: number[], categoryId: number }
 */
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { ids, categoryId } = await request.json();
  const txnIds = Array.isArray(ids) ? [...new Set(ids.filter((i: unknown) => Number.isInteger(i) && (i as number) > 0))] as number[] : [];
  if (!txnIds.length) return NextResponse.json({ error: 'Select at least one transaction' }, { status: 400 });
  if (txnIds.length > 1000) return NextResponse.json({ error: 'Too many transactions at once (max 1000)' }, { status: 400 });

  const [category] = await db.select().from(categories).where(and(eq(categories.id, categoryId), eq(categories.isActive, true)));
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 400 });

  const mine = sql`${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${session.userId})`;
  const rows = await db
    .select({ id: transactions.id, type: transactions.type })
    .from(transactions)
    .where(and(inArray(transactions.id, txnIds), mine));

  if (rows.length !== txnIds.length) return NextResponse.json({ error: 'Some transactions were not found' }, { status: 404 });
  const wrongType = rows.filter(r => r.type !== category.type);
  if (wrongType.length) {
    return NextResponse.json({
      error: `${wrongType.length} selected transaction${wrongType.length > 1 ? 's are' : ' is'} not ${category.type}; "${category.name}" is a ${category.type} category`,
    }, { status: 400 });
  }

  const updated = await db
    .update(transactions)
    .set({ categoryId: category.id, updatedAt: new Date() })
    .where(and(inArray(transactions.id, txnIds), mine))
    .returning({ id: transactions.id });

  return NextResponse.json({ updated: updated.length });
}
