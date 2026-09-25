import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { categoryGroups } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { validateGroupInput } from '@/lib/group-input';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groups = await db
    .select({ id: categoryGroups.id, name: categoryGroups.name, categoryIds: categoryGroups.categoryIds })
    .from(categoryGroups)
    .where(eq(categoryGroups.userId, session.userId))
    .orderBy(asc(categoryGroups.name));

  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const validated = await validateGroupInput(await request.json());
  if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

  const [group] = await db
    .insert(categoryGroups)
    .values({ userId: session.userId, name: validated.data.name!, categoryIds: validated.data.categoryIds! })
    .returning({ id: categoryGroups.id, name: categoryGroups.name, categoryIds: categoryGroups.categoryIds });

  return NextResponse.json({ group }, { status: 201 });
}
