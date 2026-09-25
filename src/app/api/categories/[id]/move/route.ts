import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { descendantIds } from "@/lib/categories";

/**
 * Move every transaction from one category to another (e.g. merge "Laptop Repair" into "Laptop").
 * Only the category label changes, so balances and amounts are untouched.
 *
 * Body: { targetId, includeSubcategories?, deactivateSource? }
 * - includeSubcategories: also move the transactions of every category below the source (any depth)
 * - deactivateSource: hide the source afterwards. Its remaining direct children move up one level.
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

  const all = await db.select({ id: categories.id, parentId: categories.parentId, type: categories.type, isActive: categories.isActive }).from(categories);
  const byId = new Map(all.map(c => [c.id, c]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (!target || !target.isActive) return NextResponse.json({ error: "Target category not found" }, { status: 400 });
  if (source.type !== target.type) {
    return NextResponse.json({ error: `Can't move ${source.type} transactions into a ${target.type} category` }, { status: 400 });
  }

  const sourceBranch = descendantIds(sourceId, all);
  const targetBranch = new Set([targetId, ...descendantIds(targetId, all)]);
  const targetInsideSource = sourceBranch.includes(targetId);
  // Never pull the target's own branch into it — those transactions are already under the target
  const fromIds = [sourceId, ...(includeSubcategories ? sourceBranch : [])].filter(cid => !targetBranch.has(cid));

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
        const now = new Date();
        // The target must stay visible: if it lives inside the source's branch, lift it to the source's parent
        if (targetInsideSource) {
          await tx.update(categories).set({ parentId: source.parentId, updatedAt: now }).where(eq(categories.id, targetId));
        }
        if (includeSubcategories) {
          await tx.update(categories).set({ isActive: false, updatedAt: now }).where(inArray(categories.id, fromIds));
        } else {
          await tx.update(categories).set({ isActive: false, updatedAt: now }).where(eq(categories.id, sourceId));
          // Keep its sub-categories: they move up one level (always within the depth limit)
          await tx.update(categories).set({ parentId: source.parentId, updatedAt: now }).where(eq(categories.parentId, sourceId));
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
