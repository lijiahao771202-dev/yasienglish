import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/admin-auth";

export async function GET() {
    const auth = await requireAdminUser();
    return NextResponse.json({ isAdmin: auth.ok });
}

