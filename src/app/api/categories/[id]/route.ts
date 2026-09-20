import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const catId = parseInt(id, 10);
    const body = await request.json();
    const { name, type, icon, color, parentId, isActive } = body;

    const [updatedCategory] = await db
      .update(categories)
      .set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(icon !== undefined && { icon }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId }),
        ...(isActive !== undefined && { isActive }),
        isActive: body.isActive,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, catId))
      .returning();

    if (!updatedCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

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
  try {
    const { id } = await context.params;
    const catId = parseInt(id, 10);

    // Soft delete the category
    const [deletedCategory] = await db
      .update(categories)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(categories.id, catId))
      .returning();

    if (!deletedCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // Soft delete child categories
    await db
      .update(categories)
      .set({ 
        isActive: false,
        updatedAt: new Date()
      })
      .where(eq(categories.parentId, catId));

    return NextResponse.json({ success: true, message: "Category deleted" });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
