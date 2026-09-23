import { NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, accounts } from '@/db/schema';
import { eq, sql, desc, gte, lte, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { parseHistoricalMode } from '@/lib/historical';
import { subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month'); // YYYY-MM format
  // Sums are only meaningful within one currency, so every aggregate is per-currency.
  const currency = url.searchParams.get('currency') || 'BDT';
  const historical = parseHistoricalMode(url.searchParams.get('historical'));

  // Only this user's transactions, in the selected currency, with/without imported history.
  // (Account balances below always include history: they are the real current balances.)
  const mine = and(
    sql`${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${session.userId})`,
    eq(transactions.currency, currency),
    historical === 'include' ? undefined : eq(transactions.isHistorical, historical === 'only'),
  );
  const myAccounts = and(eq(accounts.userId, session.userId), eq(accounts.isActive, true));
  
  const now = new Date();
  const currentMonthStart = monthParam 
    ? startOfMonth(new Date(monthParam + '-01'))
    : startOfMonth(now);
  const currentMonthEnd = monthParam
    ? endOfMonth(new Date(monthParam + '-01'))
    : endOfMonth(now);
  
  const monthStartStr = format(currentMonthStart, 'yyyy-MM-dd');
  const monthEndStr = format(currentMonthEnd, 'yyyy-MM-dd');

  // Summary for current/selected month
  const summaryResult = await db
    .select({
      type: transactions.type,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(and(
      mine,
      gte(transactions.date, monthStartStr),
      lte(transactions.date, monthEndStr),
    ))
    .groupBy(transactions.type);

  const totalIncome = summaryResult.find(r => r.type === 'income')?.total || 0;
  const totalExpense = summaryResult.find(r => r.type === 'expense')?.total || 0;

  // Total accounts balance
  const [balanceResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${accounts.balance}), 0)::int` })
    .from(accounts)
    .where(and(myAccounts, eq(accounts.currency, currency)));

  // Daily trend (for the selected month)
  const dailyData = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(and(
      mine,
      gte(transactions.date, monthStartStr),
      lte(transactions.date, monthEndStr),
    ))
    .groupBy(transactions.date, transactions.type)
    .orderBy(transactions.date);

  // Fill all days of the selected month
  const allDays = eachDayOfInterval({ start: currentMonthStart, end: currentMonthEnd });
  const dailyTrend = allDays.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const incomeEntry = dailyData.find(d => d.date === dateStr && d.type === 'income');
    const expenseEntry = dailyData.find(d => d.date === dateStr && d.type === 'expense');
    return {
      date: format(day, 'MMM dd'),
      income: incomeEntry?.total || 0,
      expense: expenseEntry?.total || 0,
    };
  });

  // Category breakdown (expenses this month)
  const categoryBreakdown = await db
    .select({
      name: categories.name,
      color: categories.color,
      amount: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      mine,
      eq(transactions.type, 'expense'),
      gte(transactions.date, monthStartStr),
      lte(transactions.date, monthEndStr),
    ))
    .groupBy(categories.name, categories.color)
    .orderBy(desc(sql`SUM(${transactions.amount})`));

  // Monthly comparison: the 6 months ending with the selected month
  const sixMonthsAgo = format(startOfMonth(subMonths(currentMonthStart, 5)), 'yyyy-MM-dd');
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(and(mine, gte(transactions.date, sixMonthsAgo), lte(transactions.date, monthEndStr)))
    .groupBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`, transactions.type)
    .orderBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`);

  // Build monthly comparison with all 6 months
  const monthlyComparison = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(currentMonthStart, i);
    const monthKey = format(m, 'yyyy-MM');
    const monthLabel = format(m, 'MMM yyyy');
    const income = monthlyData.find(d => d.month === monthKey && d.type === 'income')?.total || 0;
    const expense = monthlyData.find(d => d.month === monthKey && d.type === 'expense')?.total || 0;
    monthlyComparison.push({ month: monthLabel, income, expense });
  }

  // Recent transactions
  const recentTransactions = await db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      type: transactions.type,
      description: transactions.description,
      date: transactions.date,
      categoryName: categories.name,
      categoryColor: categories.color,
      accountName: accounts.name,
      isHistorical: transactions.isHistorical,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(mine)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(10);

  // Account balances
  const accountBalances = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      balance: accounts.balance,
      type: accounts.type,
      color: accounts.color,
      icon: accounts.icon,
      currency: accounts.currency,
    })
    .from(accounts)
    .where(myAccounts)
    .orderBy(accounts.name);

  return NextResponse.json({
    summary: {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      totalAccountsBalance: balanceResult.total,
    },
    dailyTrend,
    categoryBreakdown: categoryBreakdown.filter(c => c.amount > 0),
    monthlyComparison,
    recentTransactions,
    accountBalances,
  });
}

