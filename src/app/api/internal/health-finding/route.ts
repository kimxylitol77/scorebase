// POST /api/internal/health-finding
// 외부 봇 (Mac mini route-guardian 등) 이 HealthCheck 테이블에 finding 1 row insert.
// /admin/health 대시보드에 자동 노출 (채팅 UI 의 recentCritical 슬롯 + 최신 체크 결과 카드).
// Bearer auth: INTERNAL_API_TOKEN.
//
// Body:
//   {
//     category: string,                                    // kebab-case (예: "route-guardian", "broken-route")
//     severity: "HIGH" | "MED" | "LOW" | "OK",
//     key: string,                                         // 세부 키 (예: "crawl-4405")
//     message: string,                                     // 사람이 읽을 한 줄 요약
//     metadata?: Record<string, unknown>,                  // 자유 JSON (sample URL 등)
//   }

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  category: string;
  severity: "HIGH" | "MED" | "LOW" | "OK";
  key: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const VALID_SEV = new Set(["HIGH", "MED", "LOW", "OK"]);

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.category || !body.severity || !body.key || !body.message) {
    return NextResponse.json(
      { error: "category/severity/key/message required" },
      { status: 400 },
    );
  }
  if (!VALID_SEV.has(body.severity)) {
    return NextResponse.json(
      { error: `severity must be one of ${[...VALID_SEV].join("/")}` },
      { status: 400 },
    );
  }

  const row = await prisma.healthCheck.create({
    data: {
      category: body.category,
      severity: body.severity,
      key: body.key,
      message: body.message,
      metadata: (body.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
    select: { id: true, runAt: true, severity: true, category: true },
  });

  return NextResponse.json({ ok: true, row });
}
