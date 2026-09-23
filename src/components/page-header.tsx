import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Wraps content that may be showing stale data while newer data loads. */
export function Refreshable({ refreshing, children, className }: { refreshing: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      aria-busy={refreshing}
      className={cn('transition-opacity duration-200', refreshing && 'pointer-events-none opacity-50', className)}
    >
      {children}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-medium underline underline-offset-4">
          Retry
        </button>
      )}
    </div>
  );
}
