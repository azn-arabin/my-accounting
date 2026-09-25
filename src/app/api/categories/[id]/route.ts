import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { branchHeight, depthOf, descendantIds, MAX_CATEGORY_DEPTH } from "@/lib/categories";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const catId = parseInt(id, 10);
    const { name, icon, color, parentId } = await request.json();

    const [current] = await db.select().from(categories).where(eq(categories.id, catId));
    if (!current) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    if (parentId !== undefined && parentId !== null) {
      if (parentId === catId) return NextResponse.json({ error: "A category can't be its own parent" }, { status: 400 });
      const all = await db.select({ id: categories.id, parentId: categories.parentId, type: categories.type, isActive: categories.isActive }).from(categories);
      const byId = new Map(all.map(c => [c.id, c]));
      const parent = byId.get(parentId);
      if (!parent || !parent.isActive) return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
      if (parent.type !== current.type) return NextResponse.json({ error: `Parent is a ${parent.type} category` }, { status: 400 });
      // No loops: the new parent can't sit inside this category's own branch
      const live = all.filter(c => c.isActive);
      if (descendantIds(catId, live).includes(parentId)) {
        return NextResponse.json({ error: "A category can't be moved under one of its own sub-categories" }, { status: 400 });
      }
      // The whole branch moves along, so its deepest level must still fit
      if (depthOf(parent, byId) + branchHeight(catId, live) > MAX_CATEGORY_DEPTH) {
        return NextResponse.json({ error: `That would make the tree deeper than ${MAX_CATEGORY_DEPTH} levels` }, { status: 400 });
      }
    }

    // The type is fixed: changing it would break the transactions already using the category
    const [updatedCategory] = await db
      .update(categories)
      .set({
        ...(name !== undefined && { name: String(name).trim() }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId: parentId || null }),
        updatedAt: new Date(),
      })
      .where(eq(categories.id, catId))
      .returning();

    return NextResponse.json(updatedCategory);
  } catch (error) {
    console.error("Error updating category:", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const catId = parseInt(id, 10);

    // Soft delete: transactions keep pointing at it, it just stops being offered
    const [deletedCategory] = await db
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categories.id, catId))
      .returning();

    if (!deletedCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // …and everything below it, at any depth
    const below = descendantIds(catId, await db.select({ id: categories.id, parentId: categories.parentId }).from(categories));
    if (below.length) {
      await db.update(categories).set({ isActive: false, updatedAt: new Date() }).where(inArray(categories.id, below));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
