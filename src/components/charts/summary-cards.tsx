'use client';

import { ArrowDownLeft, ArrowUpRight, Scale, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface SummaryCardsProps {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalAccountsBalance: number;
  /** e.g. "September 2026" */
  periodLabel?: string;
}

export function SummaryCards({ totalIncome, totalExpense, netBalance, totalAccountsBalance, periodLabel }: SummaryCardsProps) {
  const period = periodLabel ?? 'This month';
  const cards = [
    { title: 'Income', hint: period, amount: totalIncome, icon: ArrowDownLeft, tone: 'bg-income/10 text-income' },
    { title: 'Expense', hint: period, amount: totalExpense, icon: ArrowUpRight, tone: 'bg-expense/10 text-expense' },
    {
      title: 'Net',
      hint: `${period} · income − expense`,
      amount: netBalance,
      icon: Scale,
      tone: netBalance >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
      signed: true,
    },
    { title: 'My money', hint: 'All accounts minus amanat, today', amount: totalAccountsBalance, icon: Wallet, tone: 'bg-primary/10 text-primary' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', card.tone)}>
              <card.icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {card.signed && card.amount > 0 ? '+' : card.signed && card.amount < 0 ? '−' : ''}
            {formatCurrency(Math.abs(card.amount))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-[118px] animate-pulse rounded-xl border bg-muted/40" />
      ))}
    </div>
  );
}
