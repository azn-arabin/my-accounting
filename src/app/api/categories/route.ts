import { NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth";

const TYPES = ["income", "expense", "transfer"] as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const isFlat = searchParams.get("flat") === "true";

  try {
    // Active categories, each with how many of this user's transactions use it
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        type: categories.type,
        parentId: categories.parentId,
        icon: categories.icon,
        color: categories.color,
        isActive: categories.isActive,
        txnCount: sql<number>`(
          SELECT count(*)::int FROM ${transactions}
          WHERE ${transactions.categoryId} = ${categories.id}
            AND ${transactions.accountId} IN (SELECT ${accounts.id} FROM ${accounts} WHERE ${accounts.userId} = ${session.userId})
        )`,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.name);

    if (isFlat) return NextResponse.json(rows);

    const tree = rows
      .filter(c => !c.parentId)
      .map(cat => ({ ...cat, children: rows.filter(c => c.parentId === cat.id) }));
    return NextResponse.json(tree);
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { name, type, parentId, icon, color } = await request.json();

    if (!name?.trim() || !TYPES.includes(type)) {
      return NextResponse.json({ error: "Name and a valid type are required" }, { status: 400 });
    }

    if (parentId) {
      const [parent] = await db.select().from(categories).where(and(eq(categories.id, parentId), eq(categories.isActive, true)));
      if (!parent) return NextResponse.json({ error: "Parent category not found" }, { status: 400 });
      if (parent.type !== type) return NextResponse.json({ error: `Parent is a ${parent.type} category` }, { status: 400 });
      if (parent.parentId) return NextResponse.json({ error: "Sub-categories can't have their own sub-categories" }, { status: 400 });
    }

    const [newCategory] = await db.insert(categories).values({
      name: name.trim(),
      type,
      parentId: parentId || null,
      icon,
      color,
    }).returning();

    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
