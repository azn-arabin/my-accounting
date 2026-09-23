import { SignJWT, jwtVerify } from 'jose';
import { hash, compare } from 'bcryptjs';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { users } from '@/db/schema';

const SESSION_COOKIE = 'ka-session';
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || 'fallback-secret-change-me');

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

export async function createSession(userId: number): Promise<void> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

export async function getSession(): Promise<{ userId: number } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.userId as number;
    // A valid signature isn't enough: the user may have been deleted/re-created
    // (e.g. after a DB reset), leaving a cookie that points at a stale id.
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    return user ? { userId } : null;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
