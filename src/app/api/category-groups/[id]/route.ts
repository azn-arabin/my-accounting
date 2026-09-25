import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { categoryGroups } from '@/db/schema';
import { getSession } from '@/lib/auth';
import { validateGroupInput } from '@/lib/group-input';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const validated = await validateGroupInput(await request.json(), true);
  if ('error' in validated) return NextResponse.json({ error: validated.error }, { status: 400 });

  const [group] = await db
    .update(categoryGroups)
    .set({ ...validated.data, updatedAt: new Date() })
    .where(and(eq(categoryGroups.id, parseInt(id, 10)), eq(categoryGroups.userId, session.userId)))
    .returning({ id: categoryGroups.id, name: categoryGroups.name, categoryIds: categoryGroups.categoryIds });

  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  return NextResponse.json({ group });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;

  const deleted = await db
    .delete(categoryGroups)
    .where(and(eq(categoryGroups.id, parseInt(id, 10)), eq(categoryGroups.userId, session.userId)))
    .returning({ id: categoryGroups.id });

  if (!deleted.length) return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
