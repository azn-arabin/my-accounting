import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export type TxnType = 'income' | 'expense' | 'transfer';

const TYPE_META: Record<TxnType, { icon: typeof ArrowDownLeft; tone: string; label: string; sign: string }> = {
  income: { icon: ArrowDownLeft, tone: 'bg-income/10 text-income', label: 'Income', sign: '+' },
  expense: { icon: ArrowUpRight, tone: 'bg-expense/10 text-expense', label: 'Expense', sign: '−' },
  transfer: { icon: ArrowLeftRight, tone: 'bg-transfer/10 text-transfer', label: 'Transfer', sign: '' },
};

/** Round icon chip that identifies the transaction type (with an accessible label). */
export function TxnTypeIcon({ type, className }: { type: TxnType; className?: string }) {
  const m = TYPE_META[type];
  return (
    <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.tone, className)} title={m.label}>
      <m.icon className="h-4 w-4" />
      <span className="sr-only">{m.label}</span>
    </span>
  );
}

/** Signed amount: income in the success color, everything else in regular ink. */
export function TxnAmount({ type, amount, className }: { type: TxnType; amount: number; className?: string }) {
  return (
    <span className={cn('tabular font-semibold whitespace-nowrap', type === 'income' && 'text-success', className)}>
      {TYPE_META[type].sign}
      {formatCurrency(amount)}
    </span>
  );
}

export function HistoricalBadge() {
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
      title="Imported from the SMS backup (partly estimated)"
    >
      history
    </span>
  );
}
