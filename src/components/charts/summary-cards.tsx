'use client';

import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/formatters';

interface SummaryCardsProps {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalAccountsBalance: number;
}

export function SummaryCards({ totalIncome, totalExpense, netBalance, totalAccountsBalance }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Total Income',
      amount: totalIncome,
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
    },
    {
      title: 'Total Expense',
      amount: totalExpense,
      icon: TrendingDown,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950',
    },
    {
      title: 'Net Balance',
      amount: netBalance,
      icon: Wallet,
      color: netBalance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400',
      bg: 'bg-blue-50 dark:bg-blue-950',
    },
    {
      title: 'Total Balance',
      amount: totalAccountsBalance,
      icon: PiggyBank,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-950',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
              <p className={`text-2xl font-bold ${card.color}`}>
                {formatCurrency(card.amount)}
              </p>
            </div>
            <div className={`rounded-full p-3 ${card.bg}`}>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

