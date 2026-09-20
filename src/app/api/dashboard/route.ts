import { NextResponse } from 'next/server';
import { db } from '@/db';
import { transactions, categories, accounts } from '@/db/schema';
import { eq, sql, desc, gte, lte, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth';
import { subDays, subMonths, format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const monthParam = url.searchParams.get('month'); // YYYY-MM format
  
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
    .where(eq(accounts.isActive, true));

  // Daily trend (last 30 days)
  const thirtyDaysAgo = format(subDays(now, 30), 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  const dailyData = await db
    .select({
      date: transactions.date,
      type: transactions.type,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(and(
      gte(transactions.date, thirtyDaysAgo),
      lte(transactions.date, todayStr),
    ))
    .groupBy(transactions.date, transactions.type)
    .orderBy(transactions.date);

  // Fill all 30 days
  const allDays = eachDayOfInterval({ start: subDays(now, 30), end: now });
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
      eq(transactions.type, 'expense'),
      gte(transactions.date, monthStartStr),
      lte(transactions.date, monthEndStr),
    ))
    .groupBy(categories.name, categories.color)
    .orderBy(desc(sql`SUM(${transactions.amount})`));

  // Monthly comparison (last 6 months)
  const sixMonthsAgo = format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd');
  const monthlyData = await db
    .select({
      month: sql<string>`to_char(${transactions.date}::date, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<number>`COALESCE(SUM(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(gte(transactions.date, sixMonthsAgo))
    .groupBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`, transactions.type)
    .orderBy(sql`to_char(${transactions.date}::date, 'YYYY-MM')`);

  // Build monthly comparison with all 6 months
  const monthlyComparison = [];
  for (let i = 5; i >= 0; i--) {
    const m = subMonths(now, i);
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
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .leftJoin(accounts, eq(transactions.accountId, accounts.id))
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
    })
    .from(accounts)
    .where(eq(accounts.isActive, true))
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

