import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, accounts, categories } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const txnId = parseInt(id);

  const [txn] = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      type: transactions.type,
      description: transactions.description,
      date: transactions.date,
      currency: transactions.currency,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      toAccountId: transactions.toAccountId,
      categoryName: categories.name,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(eq(transactions.id, txnId));

  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(txn);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const txnId = parseInt(id);
  const body = await request.json();

  try {
    const result = await db.transaction(async (tx) => {
      // Get existing transaction
      const [existing] = await tx.select().from(transactions).where(eq(transactions.id, txnId));
      if (!existing) throw new Error('Not found');

      // Reverse old balance effects
      if (existing.type === 'expense') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
      } else if (existing.type === 'income') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
      } else if (existing.type === 'transfer' && existing.toAccountId) {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${existing.amount}` })
          .where(eq(accounts.id, existing.toAccountId));
      }

      // Update transaction
      const newAmount = body.amount ? Math.round(body.amount * 100) : existing.amount;
      const newType = body.type || existing.type;
      const newAccountId = body.accountId || existing.accountId;
      const newToAccountId = newType === 'transfer' ? (body.toAccountId || existing.toAccountId) : null;

      const [updated] = await tx.update(transactions).set({
        amount: newAmount,
        type: newType,
        categoryId: body.categoryId || existing.categoryId,
        accountId: newAccountId,
        toAccountId: newToAccountId,
        description: body.description !== undefined ? body.description : existing.description,
        date: body.date || existing.date,
      }).where(eq(transactions.id, txnId)).returning();

      // Apply new balance effects
      if (newType === 'expense') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${newAmount}` })
          .where(eq(accounts.id, newAccountId));
      } else if (newType === 'income') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${newAmount}` })
          .where(eq(accounts.id, newAccountId));
      } else if (newType === 'transfer' && newToAccountId) {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${newAmount}` })
          .where(eq(accounts.id, newAccountId));
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${newAmount}` })
          .where(eq(accounts.id, newToAccountId));
      }

      return updated;
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Update failed';
    if (message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error('Transaction update failed:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const txnId = parseInt(id);

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(transactions).where(eq(transactions.id, txnId));
      if (!existing) throw new Error('Not found');

      // Reverse balance effects
      if (existing.type === 'expense') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
      } else if (existing.type === 'income') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
      } else if (existing.type === 'transfer' && existing.toAccountId) {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${existing.amount}` })
          .where(eq(accounts.id, existing.accountId));
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${existing.amount}` })
          .where(eq(accounts.id, existing.toAccountId));
      }

      await tx.delete(transactions).where(eq(transactions.id, txnId));
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    if (message === 'Not found') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error('Transaction delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

