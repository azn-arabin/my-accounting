'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 1 … 4 5 [6] 7 8 … 41 */
function pageList(page: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach(p => pages.add(p));
  if (page >= total - 2) [total - 3, total - 2, total - 1].forEach(p => pages.add(p));
  const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={cn('flex items-center gap-1', className)}>
      <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
        <ChevronLeft />
      </Button>
      {pageList(page, totalPages).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="w-8 text-center text-muted-foreground select-none">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'ghost'}
            size="icon-sm"
            onClick={() => onPageChange(p)}
            aria-label={`Page ${p}`}
            aria-current={p === page ? 'page' : undefined}
            className="tabular w-auto min-w-8 px-2"
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="ghost" size="icon-sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
        <ChevronRight />
      </Button>
    </nav>
  );
}
