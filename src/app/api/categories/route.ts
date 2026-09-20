import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isFlat = searchParams.get("flat") === "true";

  try {
    const allActiveCategories = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true));

    if (isFlat) {
      return NextResponse.json(allActiveCategories);
    }

    // Build tree
    const rootCategories = allActiveCategories.filter(c => !c.parentId);
    const buildTree = (cats: typeof rootCategories) => {
      return cats.map(cat => ({
        ...cat,
        children: allActiveCategories.filter(c => c.parentId === cat.id).map(c => ({
          ...c,
          children: allActiveCategories.filter(sub => sub.parentId === c.id) // simplistic tree for now, usually just 2 levels anyway
        }))
      }));
    };

    const tree = buildTree(rootCategories);
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, type, parentId, icon, color } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    const [newCategory] = await db.insert(categories).values({
      name,
      type,
      parentId: parentId || null,
      icon,
      color,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
