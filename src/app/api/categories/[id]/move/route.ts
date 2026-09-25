import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

/**
 * Move every transaction from one category to another (e.g. merge "Laptop Repair" into "Laptop").
 * Only the category label changes, so balances and amounts are untouched.
 *
 * Body: { targetId, includeSubcategories?, deactivateSource? }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const sourceId = parseInt(id, 10);
  const { targetId, includeSubcategories = false, deactivateSource = false } = await request.json();

  if (!Number.isInteger(targetId) || targetId === sourceId) {
    return NextResponse.json({ error: "Choose a different category to move to" }, { status: 400 });
  }

  const [source] = await db.select().from(categories).where(eq(categories.id, sourceId));
  const [target] = await db.select().from(categories).where(and(eq(categories.id, targetId), eq(categories.isActive, true)));
  if (!source) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "Target category not found" }, { status: 400 });
  if (source.type !== target.type) {
    return NextResponse.json({ error: `Can't move ${source.type} transactions into a ${target.type} category` }, { status: 400 });
  }

  const children = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, sourceId));
  const childIds = children.map(c => c.id).filter(cid => cid !== targetId);
  const fromIds = includeSubcategories ? [sourceId, ...childIds] : [sourceId];

  try {
    const moved = await db.transaction(async (tx) => {
      const updated = await tx
        .update(transactions)
        .set({ categoryId: targetId, updatedAt: new Date() })
        .where(and(
          inArray(transactions.categoryId, fromIds),
          sql`${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${session.userId})`,
        ))
        .returning({ id: transactions.id });

      if (deactivateSource) {
        await tx.update(categories).set({ isActive: false, updatedAt: new Date() }).where(eq(categories.id, sourceId));
        // Target was a sub-category of the source: it becomes top level instead of hanging under a hidden parent
        if (target.parentId === sourceId) {
          await tx.update(categories).set({ parentId: null, updatedAt: new Date() }).where(eq(categories.id, targetId));
          target.parentId = null;
        }
        if (includeSubcategories && childIds.length) {
          await tx.update(categories).set({ isActive: false, updatedAt: new Date() }).where(inArray(categories.id, childIds));
        } else if (childIds.length) {
          // Keep the sub-categories: re-home them under the target (or top level if the target is itself a sub-category)
          await tx
            .update(categories)
            .set({ parentId: target.parentId ? null : targetId, updatedAt: new Date() })
            .where(inArray(categories.id, childIds));
        }
      }
      return updated.length;
    });

    return NextResponse.json({ moved });
  } catch (error) {
    console.error("Error moving transactions:", error);
    return NextResponse.json({ error: "Failed to move transactions" }, { status: 500 });
  }
}
