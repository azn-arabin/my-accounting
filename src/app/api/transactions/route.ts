import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, accounts } from '@/db/schema';
import { eq, desc, and, ilike, gte, lte, count, inArray, sql } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { validateTransaction } from '@/lib/transaction-validation';
import { parseHistoricalMode } from '@/lib/historical';
import { parseIds, withSubcategories } from '@/lib/category-scope';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(parseInt(searchParams.get('page') || '1') || 1, 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20') || 20, 1), 1000);
  const type = searchParams.get('type');
  // categoryIds=1,2 (or legacy categoryId=1); sub-categories of a selected category are included
  const categoryIds = parseIds(searchParams.get('categoryIds') ?? searchParams.get('categoryId'));
  const accountId = searchParams.get('accountId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search');
  const historical = parseHistoricalMode(searchParams.get('historical'));

  const conditions = [eq(accounts.userId, session.userId)];
  if (type) conditions.push(eq(transactions.type, type as 'income' | 'expense' | 'transfer'));
  if (categoryIds.length) conditions.push(inArray(transactions.categoryId, await withSubcategories(categoryIds)));
  if (accountId) conditions.push(eq(transactions.accountId, parseInt(accountId)));
  if (startDate) conditions.push(gte(transactions.date, startDate));
  if (endDate) conditions.push(lte(transactions.date, endDate));
  if (search) conditions.push(ilike(transactions.description, `%${search}%`));
  if (historical !== 'include') conditions.push(eq(transactions.isHistorical, historical === 'only'));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = await db
    .select({ count: count() })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(where);

  const total = totalResult.count;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  const rows = await db
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
      isHistorical: transactions.isHistorical,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountName: accounts.name,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(where)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({ transactions: rows, total, page, totalPages });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const validated = await validateTransaction(session.userId, body);
  if ('error' in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const { amount: amountInPaisa, type, categoryId, accountId, toAccountId, description, date, currency } = validated.data;

  try {
    const result = await db.transaction(async (tx) => {
      // Create the transaction
      const [newTxn] = await tx.insert(transactions).values({
        amount: amountInPaisa,
        type,
        categoryId,
        accountId,
        toAccountId,
        description,
        date,
        currency,
      }).returning();

      // Update account balances
      if (type === 'expense') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${amountInPaisa}` })
          .where(eq(accounts.id, accountId));
      } else if (type === 'income') {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${amountInPaisa}` })
          .where(eq(accounts.id, accountId));
      } else if (type === 'transfer' && toAccountId) {
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} - ${amountInPaisa}` })
          .where(eq(accounts.id, accountId));
        await tx.update(accounts)
          .set({ balance: sql`${accounts.balance} + ${amountInPaisa}` })
          .where(eq(accounts.id, toAccountId));
      }

      return newTxn;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Transaction creation failed:', error);
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
  }
}

