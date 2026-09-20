'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  ArrowRightLeft, 
  Landmark, 
  Tags, 
  BarChart3, 
  LogOut,
  Wallet,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/sidebar-context';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
  { name: 'Accounts', href: '/accounts', icon: Landmark },
  { name: 'Categories', href: '/categories', icon: Tags },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 md:hidden" 
          onClick={close}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 flex-col border-r bg-background transition-transform md:static md:flex md:w-64",
        isOpen ? "flex translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="flex h-16 shrink-0 items-center px-6 border-b">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
            <Wallet className="h-6 w-6 text-primary" />
            <span>Keep Accounts</span>
          </Link>
          <Button variant="ghost" size="icon" className="md:hidden ml-auto" onClick={close}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        
        <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all hover:text-primary",
                  isActive ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-secondary/50"
                )}
                onClick={() => {
                  if (window.innerWidth < 768) close();
                }}
              >
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>
        
        <div className="border-t p-4">
          <Button 
            variant="ghost" 
            className="w-full justify-start gap-3 text-muted-foreground hover:text-primary"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </div>
    </>
  );
}
