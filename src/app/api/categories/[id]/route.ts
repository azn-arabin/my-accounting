import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

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
      const [parent] = await db.select().from(categories).where(and(eq(categories.id, parentId), eq(categories.isActive, true)));
      if (!parent) return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
      if (parent.type !== current.type) return NextResponse.json({ error: `Parent is a ${parent.type} category` }, { status: 400 });
      if (parent.parentId) return NextResponse.json({ error: "Sub-categories can't have their own sub-categories" }, { status: 400 });
      const [child] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, catId), eq(categories.isActive, true)));
      if (child) return NextResponse.json({ error: "This category has sub-categories, so it must stay top level" }, { status: 400 });
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

    await db
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categories.parentId, catId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
