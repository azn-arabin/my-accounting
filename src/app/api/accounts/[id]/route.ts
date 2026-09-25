import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts, ACCOUNT_ROLES } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const accountId = parseInt(id, 10);
    const userId = session.userId;
    const body = await request.json();
    
    const { name, type, icon, color, isActive, role, showOnDashboard } = body;
    if (role !== undefined && !ACCOUNT_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid account role" }, { status: 400 });
    }

    const updateData: Partial<typeof accounts.$inferInsert> = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (icon !== undefined) updateData.icon = icon;
    if (color !== undefined) updateData.color = color;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (role !== undefined) updateData.role = role;
    if (showOnDashboard !== undefined) updateData.showOnDashboard = Boolean(showOnDashboard);
    
    updateData.updatedAt = new Date();

    const updatedAccount = await db
      .update(accounts)
      .set(updateData)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning();

    if (!updatedAccount.length) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ account: updatedAccount[0] });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const accountId = parseInt(id, 10);
    const userId = session.userId;

    const deletedAccount = await db
      .update(accounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .returning();

    if (!deletedAccount.length) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, account: deletedAccount[0] });
  } catch (error) {
    console.error("Error deleting account:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
