'use client';

import { Menu, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSidebar } from '@/components/sidebar-context';

export function AppHeader() {
  const { toggle } = useSidebar();

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggle}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>
      
      <div className="w-full flex-1">
        <form>
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search..."
              className="w-full appearance-none bg-background pl-8 shadow-none rounded-md border h-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </form>
      </div>
      
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
