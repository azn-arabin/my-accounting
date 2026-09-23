'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wallet, Landmark, Smartphone, CreditCard, CircleDot, ArrowRight } from 'lucide-react';
import { SummaryCards, SummaryCardsSkeleton } from '@/components/charts/summary-cards';
import { DailyTrendChart } from '@/components/charts/area-chart';
import { CategoryPieChart } from '@/components/charts/pie-chart';
import { MonthlyBarChart } from '@/components/charts/bar-chart';
import { ChartCard } from '@/components/charts/chart-parts';
import { PageHeader, Refreshable, ErrorBanner } from '@/components/page-header';
import { MonthPicker, currentMonth, monthLabel } from '@/components/month-picker';
import { TxnAmount, TxnTypeIcon, HistoricalBadge, type TxnType } from '@/components/txn-bits';
import { formatCurrency, formatDate } from '@/lib/formatters';
import { useHistoricalMode } from '@/lib/use-historical-mode';
import { useApi } from '@/lib/use-api';

interface DashboardData {
  summary: { totalIncome: number; totalExpense: number; netBalance: number; totalAccountsBalance: number };
  dailyTrend: Array<{ date: string; income: number; expense: number }>;
  categoryBreakdown: Array<{ name: string; amount: number; color: string | null }>;
  monthlyComparison: Array<{ month: string; income: number; expense: number }>;
  recentTransactions: Array<{
    id: number;
    amount: number;
    type: TxnType;
    description: string | null;
    date: string;
    categoryName: string | null;
    accountName: string | null;
    isHistorical: boolean;
  }>;
  accountBalances: Array<{ id: number; name: string; balance: number; type: string; color: string | null }>;
}

const accountIcons: Record<string, typeof Wallet> = {
  cash: Wallet,
  bank: Landmark,
  mobile_banking: Smartphone,
  credit_card: CreditCard,
  other: CircleDot,
};

export default function DashboardPage() {
  const [month, setMonth] = useState(currentMonth);
  const { mode } = useHistoricalMode();
  const { data, error, loading, refreshing, reload } = useApi<DashboardData>(`/api/dashboard?month=${month}&historical=${mode}`);
  const period = monthLabel(month);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview for ${period}`}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {error && <ErrorBanner message={error} onRetry={reload} />}

      {loading ? (
        <DashboardSkeleton />
      ) : data ? (
        <Refreshable refreshing={refreshing} className="space-y-6">
          <SummaryCards {...data.summary} periodLabel={period} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <DailyTrendChart data={data.dailyTrend} subtitle={period} className="lg:col-span-3" />
            <CategoryPieChart data={data.categoryBreakdown} subtitle={period} className="lg:col-span-2" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <MonthlyBarChart data={data.monthlyComparison} subtitle={`6 months to ${period}`} className="lg:col-span-3" />

            <ChartCard
              title="Accounts"
              subtitle="Current balances"
              className="lg:col-span-2"
              action={<Link href="/accounts" className="text-xs font-medium text-primary hover:underline">Manage</Link>}
            >
              <ul className="-mx-2 divide-y">
                {data.accountBalances.map((account) => {
                  const Icon = accountIcons[account.type] || CircleDot;
                  return (
                    <li key={account.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `color-mix(in oklch, ${account.color || 'var(--muted-foreground)'} 14%, transparent)`, color: account.color || undefined }}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{account.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{account.type.replace('_', ' ')}</p>
                        </div>
                      </div>
                      <p className={`tabular text-sm font-semibold ${account.balance < 0 ? 'text-destructive' : ''}`}>
                        {formatCurrency(account.balance)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </ChartCard>
          </div>

          <ChartCard
            title="Recent transactions"
            action={
              <Link href="/transactions" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            }
          >
            {data.recentTransactions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No transactions yet</p>
            ) : (
              <ul className="-mx-2 divide-y">
                {data.recentTransactions.map((txn) => (
                  <li key={txn.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <TxnTypeIcon type={txn.type} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-medium">
                          <span className="truncate">{txn.description || txn.categoryName || 'Transaction'}</span>
                          {txn.isHistorical && <HistoricalBadge />}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(txn.date)} · {txn.categoryName} · {txn.accountName}
                        </p>
                      </div>
                    </div>
                    <TxnAmount type={txn.type} amount={txn.amount} className="text-sm" />
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </Refreshable>
      ) : null}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SummaryCardsSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="h-[348px] animate-pulse rounded-xl border bg-muted/40 lg:col-span-3" />
        <div className="h-[348px] animate-pulse rounded-xl border bg-muted/40 lg:col-span-2" />
      </div>
      <div className="h-[348px] animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}
