'use client';

import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { HistoricalFilter } from '@/components/historical-filter';
import { useSidebar } from '@/components/sidebar-context';
import { useHistoricalMode } from '@/lib/use-historical-mode';
import { useIsFetching } from '@/lib/use-api';
import { navItems } from '@/components/app-sidebar';

export function AppHeader() {
  const { toggle } = useSidebar();
  const pathname = usePathname();
  const { mode, setMode } = useHistoricalMode();
  const fetching = useIsFetching();
  const title = navItems.find(i => pathname === i.href || pathname.startsWith(`${i.href}/`))?.name ?? '';

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60 md:px-6">
      {/* Global loading bar */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-300 ${fetching ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="animate-loading-bar h-full w-2/5 rounded-full bg-primary" />
      </div>

      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggle} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <p className="text-sm font-medium text-muted-foreground">{title}</p>

      <div className="ml-auto flex items-center gap-2">
        <HistoricalFilter value={mode} onChange={setMode} />
        <ThemeToggle />
      </div>
    </header>
  );
}
