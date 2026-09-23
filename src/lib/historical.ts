/**
 * Historical rows are the ones imported from the SMS backup (partly estimated). Every list, chart and
 * summary can include them, hide them, or show only them. Account balances always include them.
 */
export type HistoricalMode = 'include' | 'exclude' | 'only';

export const HISTORICAL_LABELS: Record<HistoricalMode, string> = {
  include: 'All data',
  exclude: 'Hide historical',
  only: 'Historical only',
};

export function parseHistoricalMode(value: string | null | undefined): HistoricalMode {
  return value === 'exclude' || value === 'only' ? value : 'include';
}
