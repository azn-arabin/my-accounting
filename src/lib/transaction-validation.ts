import { db } from '@/db';
import { accounts, categories } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface TransactionInput {
  amount: number; // in paisa
  type: TransactionType;
  categoryId: number;
  accountId: number;
  toAccountId: number | null;
  description: string | null;
  date: string;
  currency: string; // always the source account's currency
}

const TYPES: TransactionType[] = ['income', 'expense', 'transfer'];

function toId(value: unknown): number | null {
  const n = typeof value === 'string' ? parseInt(value, 10) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Validate a transaction payload against the current user's accounts.
 * `amount` in the payload is in taka; the returned input is in paisa.
 */
export async function validateTransaction(
  userId: number,
  body: Record<string, unknown>,
): Promise<{ data: TransactionInput } | { error: string }> {
  const amountTaka = Number(body.amount);
  if (!Number.isFinite(amountTaka) || amountTaka <= 0) return { error: 'Amount must be a positive number' };
  const amount = Math.round(amountTaka * 100);

  const type = body.type as TransactionType;
  if (!TYPES.includes(type)) return { error: 'Invalid transaction type' };

  const date = typeof body.date === 'string' ? body.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return { error: 'Invalid date (expected YYYY-MM-DD)' };

  const categoryId = toId(body.categoryId);
  const accountId = toId(body.accountId);
  if (!categoryId) return { error: 'Category is required' };
  if (!accountId) return { error: 'Account is required' };

  const [account] = await db.select({ id: accounts.id, currency: accounts.currency }).from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId), eq(accounts.isActive, true)));
  if (!account) return { error: 'Account not found' };

  const [category] = await db.select({ type: categories.type }).from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.isActive, true)));
  if (!category) return { error: 'Category not found' };
  if (category.type !== type) return { error: `Category is for ${category.type}, not ${type}` };

  let toAccountId: number | null = null;
  if (type === 'transfer') {
    toAccountId = toId(body.toAccountId);
    if (!toAccountId) return { error: 'Destination account is required for a transfer' };
    if (toAccountId === accountId) return { error: 'Cannot transfer to the same account' };
    const [toAccount] = await db.select({ id: accounts.id, currency: accounts.currency }).from(accounts)
      .where(and(eq(accounts.id, toAccountId), eq(accounts.userId, userId), eq(accounts.isActive, true)));
    if (!toAccount) return { error: 'Destination account not found' };
    // A single `amount` can't describe both sides of a cross-currency transfer
    // (needs a separate destination amount / rate), so block it until that exists.
    if (toAccount.currency !== account.currency) {
      return { error: `Cross-currency transfers (${account.currency} → ${toAccount.currency}) are not supported yet` };
    }
  }

  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;

  return { data: { amount, type, categoryId, accountId, toAccountId, description, date, currency: account.currency } };
}
