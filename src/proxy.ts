import { NextResponse } from 'next/server';
import type { NextRequest, NextFetchEvent } from 'next/server';

export function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // Public routes that don't need auth
  const publicPaths = ['/login', '/api/auth'];
  const isPublic = publicPaths.some(path => pathname.startsWith(path));
  const isStatic = pathname.startsWith('/_next') || 
                   pathname.startsWith('/favicon') ||
                   pathname.includes('.');

  if (isPublic || isStatic) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = request.cookies.get('ka-session');
  if (!session?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
