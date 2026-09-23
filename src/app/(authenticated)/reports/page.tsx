'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SummaryCards, SummaryCardsSkeleton } from '@/components/charts/summary-cards';
import { CategoryPieChart } from '@/components/charts/pie-chart';
import { MonthlyBarChart } from '@/components/charts/bar-chart';
import { DailyTrendChart } from '@/components/charts/area-chart';
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
}

interface Transaction {
  id: number;
  amount: number;
  type: TxnType;
  description: string | null;
  date: string;
  categoryName: string | null;
  accountName: string | null;
  isHistorical: boolean;
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth);
  const { mode } = useHistoricalMode();
  const period = monthLabel(month);
  const dash = useApi<DashboardData>(`/api/dashboard?month=${month}&historical=${mode}`);
  const txns = useApi<{ transactions: Transaction[] }>(
    `/api/transactions?startDate=${month}-01&endDate=${month}-31&limit=500&historical=${mode}`,
  );
  const data = dash.data;
  const monthTxns = txns.data?.transactions ?? [];

  const txnsByDate: Record<string, Transaction[]> = {};
  for (const t of monthTxns) (txnsByDate[t.date] ??= []).push(t);
  const sortedDates = Object.keys(txnsByDate).sort((a, b) => b.localeCompare(a));
  const totalExpense = data?.categoryBreakdown.reduce((s, c) => s + c.amount, 0) ?? 0;

  return (
    <>
      <PageHeader title="Reports" description={`Detailed numbers for ${period}`} actions={<MonthPicker value={month} onChange={setMonth} />} />

      {(dash.error || txns.error) && <ErrorBanner message={dash.error || txns.error!} onRetry={() => { dash.reload(); txns.reload(); }} />}

      {dash.loading || !data ? (
        <SummaryCardsSkeleton />
      ) : (
        <Refreshable refreshing={dash.refreshing || txns.refreshing}>
          <Tabs defaultValue="summary" className="gap-6">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="breakdown">Categories</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-6">
              <SummaryCards {...data.summary} periodLabel={period} />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <DailyTrendChart data={data.dailyTrend} subtitle={period} />

                <ChartCard title="Transactions by day" subtitle={`${monthTxns.length} transactions`}>
                  <div className="-mr-2 max-h-[300px] space-y-5 overflow-y-auto pr-2">
                    {sortedDates.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">No transactions this month</p>
                    ) : (
                      sortedDates.map((date) => {
                        const dayTxns = txnsByDate[date];
                        const dayNet = dayTxns.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0), 0);
                        return (
                          <div key={date}>
                            <div className="sticky top-0 z-10 mb-1 flex items-center justify-between bg-card py-1 text-xs">
                              <span className="font-medium text-muted-foreground">{formatDate(date)}</span>
                              <span className={`tabular font-medium ${dayNet >= 0 ? 'text-success' : 'text-foreground'}`}>
                                {dayNet > 0 ? '+' : dayNet < 0 ? '−' : ''}{formatCurrency(Math.abs(dayNet))}
                              </span>
                            </div>
                            <ul className="divide-y">
                              {dayTxns.map((txn) => (
                                <li key={txn.id} className="flex items-center justify-between gap-3 py-2">
                                  <div className="flex min-w-0 items-center gap-2.5">
                                    <TxnTypeIcon type={txn.type} className="h-7 w-7" />
                                    <div className="min-w-0">
                                      <p className="flex items-center gap-2 text-sm">
                                        <span className="truncate">{txn.description || txn.categoryName || 'Transaction'}</span>
                                        {txn.isHistorical && <HistoricalBadge />}
                                      </p>
                                      <p className="truncate text-xs text-muted-foreground">{txn.categoryName} · {txn.accountName}</p>
                                    </div>
                                  </div>
                                  <TxnAmount type={txn.type} amount={txn.amount} className="text-sm" />
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent value="breakdown">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <CategoryPieChart data={data.categoryBreakdown} subtitle={period} limit={10} />
                <ChartCard title="Category details" subtitle={`Total expense ${formatCurrency(totalExpense)}`}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.categoryBreakdown.map((cat) => (
                        <TableRow key={cat.name}>
                          <TableCell>{cat.name}</TableCell>
                          <TableCell className="tabular text-right font-medium">{formatCurrency(cat.amount)}</TableCell>
                          <TableCell className="tabular text-right text-muted-foreground">
                            {totalExpense > 0 ? ((cat.amount / totalExpense) * 100).toFixed(1) : '0.0'}%
                          </TableCell>
                        </TableRow>
                      ))}
                      {data.categoryBreakdown.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">No expenses this month</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ChartCard>
              </div>
            </TabsContent>

            <TabsContent value="trends" className="space-y-6">
              <MonthlyBarChart data={data.monthlyComparison} subtitle={`6 months to ${period}`} />
              <ChartCard title="Month over month">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Income</TableHead>
                      <TableHead className="text-right">Expense</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthlyComparison.map((m) => {
                      const net = m.income - m.expense;
                      return (
                        <TableRow key={m.month}>
                          <TableCell className="font-medium">{m.month}</TableCell>
                          <TableCell className="tabular text-right">{formatCurrency(m.income)}</TableCell>
                          <TableCell className="tabular text-right">{formatCurrency(m.expense)}</TableCell>
                          <TableCell className={`tabular text-right font-semibold ${net >= 0 ? 'text-success' : 'text-destructive'}`}>
                            {net > 0 ? '+' : net < 0 ? '−' : ''}{formatCurrency(Math.abs(net))}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ChartCard>
            </TabsContent>
          </Tabs>
        </Refreshable>
      )}
    </>
  );
}
