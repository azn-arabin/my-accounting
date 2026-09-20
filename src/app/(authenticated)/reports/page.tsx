'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SummaryCards } from '@/components/charts/summary-cards';
import { CategoryPieChart } from '@/components/charts/pie-chart';
import { MonthlyBarChart } from '@/components/charts/bar-chart';
import { formatCurrency, formatDate, getTypeBadgeVariant } from '@/lib/formatters';
import { format, subMonths } from 'date-fns';

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
    accountName: string | null;
  }>;
}

interface Transaction {
  id: number;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  description: string | null;
  date: string;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string | null;
}

export default function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [monthTxns, setMonthTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate last 12 months for selector
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = subMonths(new Date(), i);
    months.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [dashRes, txnRes] = await Promise.all([
      fetch(`/api/dashboard?month=${selectedMonth}`),
      fetch(`/api/transactions?startDate=${selectedMonth}-01&endDate=${selectedMonth}-31&limit=200`),
    ]);
    const dash = await dashRes.json();
    const txn = await txnRes.json();
    setDashData(dash);
    setMonthTxns(txn.transactions || []);
    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  if (!dashData) return <p>Failed to load reports</p>;

  // Group transactions by date
  const txnsByDate: Record<string, Transaction[]> = {};
  monthTxns.forEach(txn => {
    if (!txnsByDate[txn.date]) txnsByDate[txn.date] = [];
    txnsByDate[txn.date].push(txn);
  });
  const sortedDates = Object.keys(txnsByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <Select value={selectedMonth} onValueChange={(v) => setSelectedMonth(v || '')}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
          <TabsTrigger value="breakdown">Category Breakdown</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        {/* Monthly Summary Tab */}
        <TabsContent value="summary" className="space-y-6">
          <SummaryCards {...dashData.summary} />

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Transactions by Day</h3>
            {sortedDates.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions this month</p>
            ) : (
              <div className="space-y-6">
                {sortedDates.map(date => {
                  const dayTxns = txnsByDate[date];
                  const dayTotal = dayTxns.reduce((sum, t) => {
                    if (t.type === 'income') return sum + t.amount;
                    if (t.type === 'expense') return sum - t.amount;
                    return sum;
                  }, 0);

                  return (
                    <div key={date}>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-sm">{formatDate(date)}</h4>
                        <span className={`text-sm font-semibold ${dayTotal >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {dayTotal >= 0 ? '+' : ''}{formatCurrency(Math.abs(dayTotal))}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {dayTxns.map(txn => (
                          <div key={txn.id} className="flex items-center justify-between rounded-lg border p-3">
                            <div>
                              <p className="text-sm font-medium">{txn.description || txn.categoryName || 'Transaction'}</p>
                              <p className="text-xs text-muted-foreground">{txn.categoryName} · {txn.accountName}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold ${
                                txn.type === 'income' ? 'text-green-600 dark:text-green-400' :
                                txn.type === 'expense' ? 'text-red-600 dark:text-red-400' :
                                'text-blue-600 dark:text-blue-400'
                              }`}>
                                {txn.type === 'income' ? '+' : txn.type === 'expense' ? '-' : '↔'}
                                {formatCurrency(txn.amount)}
                              </p>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeBadgeVariant(txn.type)}`}>
                                {txn.type}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Category Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <CategoryPieChart data={dashData.categoryBreakdown} />
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Category Details</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashData.categoryBreakdown.map((cat, i) => {
                    const totalExp = dashData.categoryBreakdown.reduce((s, c) => s + c.amount, 0);
                    const pct = totalExp > 0 ? ((cat.amount / totalExp) * 100).toFixed(1) : '0';
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cat.color || '#6b7280' }} />
                            {cat.name}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(cat.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{pct}%</TableCell>
                      </TableRow>
                    );
                  })}
                  {dashData.categoryBreakdown.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No expenses this month
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </div>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <MonthlyBarChart data={dashData.monthlyComparison} />

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Month-over-Month</h3>
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
                {dashData.monthlyComparison.map((m, i) => {
                  const net = m.income - m.expense;
                  return (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="text-right text-green-600 dark:text-green-400">{formatCurrency(m.income)}</TableCell>
                      <TableCell className="text-right text-red-600 dark:text-red-400">{formatCurrency(m.expense)}</TableCell>
                      <TableCell className={`text-right font-semibold ${net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {net >= 0 ? '+' : ''}{formatCurrency(Math.abs(net))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
