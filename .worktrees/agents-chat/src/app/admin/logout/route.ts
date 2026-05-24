import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

async function logout() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

export async function GET(req: Request) {
  await logout();
  const url = new URL("/admin/login", req.url);
  return NextResponse.redirect(url);
}

export async function POST(req: Request) {
  await logout();
  const url = new URL("/admin/login", req.url);
  return NextResponse.redirect(url);
}
