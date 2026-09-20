/**
 * Currency and date formatting utilities for the Keep Accounts app.
 */

/**
 * Format amount from paisa to display currency.
 * e.g., 1500000 paisa → "৳15,000.00"
 */
export function formatCurrency(amountInPaisa: number, currency: string = 'BDT'): string {
  const amount = amountInPaisa / 100;
  
  const symbols: Record<string, string> = {
    BDT: '৳',
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
  };

  const symbol = symbols[currency] || currency;
  
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format amount without currency symbol.
 * e.g., 1500000 → "15,000.00"
 */
export function formatAmount(amountInPaisa: number): string {
  const amount = amountInPaisa / 100;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse a display amount string to paisa.
 * e.g., "15000" → 1500000
 */
export function toPaisa(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert paisa to display amount.
 * e.g., 1500000 → 15000
 */
export function fromPaisa(amountInPaisa: number): number {
  return amountInPaisa / 100;
}

/**
 * Format a date string for display.
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date as YYYY-MM-DD for API/DB.
 */
export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get transaction type color classes.
 */
export function getTypeColor(type: 'income' | 'expense' | 'transfer'): string {
  switch (type) {
    case 'income': return 'text-green-600 dark:text-green-400';
    case 'expense': return 'text-red-600 dark:text-red-400';
    case 'transfer': return 'text-blue-600 dark:text-blue-400';
  }
}

/**
 * Get transaction type badge variant.
 */
export function getTypeBadgeVariant(type: 'income' | 'expense' | 'transfer'): string {
  switch (type) {
    case 'income': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'expense': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'transfer': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
}

