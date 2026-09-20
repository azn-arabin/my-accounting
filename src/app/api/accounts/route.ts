import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))
      .orderBy(asc(accounts.name));

    return NextResponse.json({ accounts: userAccounts });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;
    const body = await request.json();
    const { name, type, balance, currency, icon, color } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 });
    }

    // Convert regular number (taka) to paisa (*100)
    const balanceInPaisa = balance ? Math.round(Number(balance) * 100) : 0;

    const newAccount = await db
      .insert(accounts)
      .values({
        name,
        type,
        balance: balanceInPaisa,
        currency: currency || "BDT",
        icon,
        color,
        userId: session.userId,
      })
      .returning();

    return NextResponse.json({ account: newAccount[0] }, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
