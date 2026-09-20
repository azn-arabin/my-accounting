'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { SummaryCards } from '@/components/charts/summary-cards';
import { DailyTrendChart } from '@/components/charts/area-chart';
import { CategoryPieChart } from '@/components/charts/pie-chart';
import { MonthlyBarChart } from '@/components/charts/bar-chart';
import { formatCurrency, formatDate, getTypeBadgeVariant } from '@/lib/formatters';
import { Wallet, Landmark, Smartphone, CreditCard, CircleDot } from 'lucide-react';

interface DashboardData {
  summary: {
    totalIncome: number;
    totalExpense: number;
    netBalance: number;
    totalAccountsBalance: number;
  };
  dailyTrend: Array<{ date: string; income: number; expense: number }>;
  categoryBreakdown: Array<{ name: string; amount: number; color: string | null }>;
  monthlyComparison: Array<{ month: string; income: number; expense: number }>;
  recentTransactions: Array<{
    id: number;
    amount: number;
    type: string;
    description: string | null;
    date: string;
    categoryName: string | null;
    categoryColor: string | null;
    accountName: string | null;
  }>;
  accountBalances: Array<{
    id: number;
    name: string;
    balance: number;
    type: string;
    color: string | null;
    icon: string | null;
  }>;
}

const accountIcons: Record<string, typeof Wallet> = {
  cash: Wallet,
  bank: Landmark,
  mobile_banking: Smartphone,
  credit_card: CreditCard,
  other: CircleDot,
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Skeleton className="h-80 rounded-xl lg:col-span-3" />
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!data) return <p>Failed to load dashboard</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      {/* Summary Cards */}
      <SummaryCards {...data.summary} />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DailyTrendChart data={data.dailyTrend} />
        </div>
        <div className="lg:col-span-2">
          <CategoryPieChart data={data.categoryBreakdown} />
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <MonthlyBarChart data={data.monthlyComparison} />
        </div>
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Account Balances</h3>
            <div className="space-y-3">
              {data.accountBalances.map((account) => {
                const Icon = accountIcons[account.type] || CircleDot;
                return (
                  <div key={account.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full p-2" style={{ backgroundColor: (account.color || '#6b7280') + '20' }}>
                        <Icon className="h-4 w-4" style={{ color: account.color || '#6b7280' }} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{account.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{account.type.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <p className="font-semibold">{formatCurrency(account.balance)}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Transactions */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
        <div className="space-y-2">
          {data.recentTransactions.map((txn) => (
            <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: txn.categoryColor || '#6b7280' }}
                />
                <div>
                  <p className="font-medium text-sm">{txn.description || txn.categoryName || 'Transaction'}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(txn.date)} · {txn.accountName}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-sm ${
                  txn.type === 'income' ? 'text-green-600 dark:text-green-400' :
                  txn.type === 'expense' ? 'text-red-600 dark:text-red-400' :
                  'text-blue-600 dark:text-blue-400'
                }`}>
                  {txn.type === 'income' ? '+' : txn.type === 'expense' ? '-' : '↔'}{formatCurrency(txn.amount)}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeBadgeVariant(txn.type as 'income' | 'expense' | 'transfer')}`}>
                  {txn.type}
                </span>
              </div>
            </div>
          ))}
          {data.recentTransactions.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No transactions yet</p>
          )}
        </div>
      </Card>
    </div>
  );
}
