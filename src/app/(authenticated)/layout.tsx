import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { SidebarProvider } from '@/components/sidebar-context';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex-1 overflow-y-auto">
            <div className="animate-page-in mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
