import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, accounts, categories } from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { validateTransaction } from '@/lib/transaction-validation';

/** Transaction ids belonging to the user (via its source account). */
function ownedBy(txnId: number, userId: number) {
  return and(
    eq(transactions.id, txnId),
    sql`${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${userId})`,
  );
}

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
    .where(ownedBy(txnId, session.userId));

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
      const [existing] = await tx.select().from(transactions).where(ownedBy(txnId, session.userId));
      if (!existing) throw new Error('Not found');

      // Validate the merged (existing + changed) values
      const validated = await validateTransaction(session.userId, {
        amount: body.amount ?? existing.amount / 100,
        type: body.type ?? existing.type,
        categoryId: body.categoryId ?? existing.categoryId,
        accountId: body.accountId ?? existing.accountId,
        toAccountId: body.toAccountId ?? existing.toAccountId,
        description: body.description !== undefined ? body.description : existing.description,
        date: body.date ?? existing.date,
      });
      if ('error' in validated) throw new ValidationError(validated.error);
      const next = validated.data;

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
      const newAmount = next.amount;
      const newType = next.type;
      const newAccountId = next.accountId;
      const newToAccountId = next.toAccountId;

      const [updated] = await tx.update(transactions).set({
        amount: newAmount,
        type: newType,
        categoryId: next.categoryId,
        accountId: newAccountId,
        toAccountId: newToAccountId,
        description: next.description,
        date: next.date,
        currency: next.currency,
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
    if (error instanceof ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
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
      const [existing] = await tx.select().from(transactions).where(ownedBy(txnId, session.userId));
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


class ValidationError extends Error {}
