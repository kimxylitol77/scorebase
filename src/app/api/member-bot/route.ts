// /api/member-bot — 회원 커스텀 예측 봇 CRUD (로그인 세션 필수, 계정당 최대 3개).
// GET 내 봇 목록 · POST 생성 · PATCH 수정(이름/손잡이/활성/백테스트 캐시) · DELETE 삭제.
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { clampKnobs, type BotKnobs } from "@/lib/predict/member-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOTS_PER_USER = 3;

const BOT_SELECT = {
  id: true,
  name: true,
  league: true,
  knobs: true,
  backtestCache: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

function validName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (name.length < 1 || name.length > 20) return null;
  return name;
}

function validLeague(raw: unknown): string | null {
  if (raw == null) return "ALL";
  if (typeof raw !== "string" || !/^[A-Z0-9_]{2,24}$/.test(raw)) return null;
  return raw;
}

/** 저장 시점 백테스트 요약 — 숫자 필드만 통과(임의 JSON 저장 방지) */
function validBacktest(raw: unknown): Record<string, number> | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ["n", "hits", "acc", "brier", "vsModel"]) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const bots = await prisma.memberBot.findMany({
    where: { userId },
    select: BOT_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ok: true, bots });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: { name?: unknown; knobs?: unknown; league?: unknown; backtest?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const name = validName(body.name);
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "이름은 1~20자여야 합니다." },
      { status: 400 },
    );
  }
  const league = validLeague(body.league);
  if (!league) {
    return NextResponse.json({ ok: false, error: "invalid league" }, { status: 400 });
  }

  const count = await prisma.memberBot.count({ where: { userId } });
  if (count >= MAX_BOTS_PER_USER) {
    return NextResponse.json(
      { ok: false, error: `봇은 계정당 최대 ${MAX_BOTS_PER_USER}개까지 만들 수 있습니다.` },
      { status: 409 },
    );
  }

  const knobs: BotKnobs = clampKnobs(body.knobs as Partial<BotKnobs> | null);
  const backtest = validBacktest(body.backtest);

  const bot = await prisma.memberBot.create({
    data: {
      userId,
      name,
      league,
      knobs: knobs as unknown as Prisma.InputJsonValue,
      backtestCache: backtest ? { ...backtest, savedAt: new Date().toISOString() } : undefined,
    },
    select: BOT_SELECT,
  });
  return NextResponse.json({ ok: true, bot });
}

export async function PATCH(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: {
    id?: unknown;
    name?: unknown;
    knobs?: unknown;
    isActive?: unknown;
    backtest?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });

  // 소유 확인 — 남의 봇 id 로 update 시도 차단
  const owned = await prisma.memberBot.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return NextResponse.json({ ok: false, error: "bot not found" }, { status: 404 });

  const data: {
    name?: string;
    knobs?: Prisma.InputJsonValue;
    isActive?: boolean;
    backtestCache?: Prisma.InputJsonValue;
  } = {};
  if (body.name !== undefined) {
    const name = validName(body.name);
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "이름은 1~20자여야 합니다." },
        { status: 400 },
      );
    }
    data.name = name;
  }
  if (body.knobs !== undefined) {
    data.knobs = clampKnobs(
      body.knobs as Partial<BotKnobs> | null,
    ) as unknown as Prisma.InputJsonValue;
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.backtest !== undefined) {
    const backtest = validBacktest(body.backtest);
    if (backtest) data.backtestCache = { ...backtest, savedAt: new Date().toISOString() };
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "변경할 내용이 없습니다." }, { status: 400 });
  }

  const bot = await prisma.memberBot.update({ where: { id }, data, select: BOT_SELECT });
  return NextResponse.json({ ok: true, bot });
}

export async function DELETE(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  // deleteMany + userId 조건 — 소유 봇만 삭제 (픽은 onDelete: Cascade)
  const r = await prisma.memberBot.deleteMany({ where: { id, userId } });
  if (r.count === 0) {
    return NextResponse.json({ ok: false, error: "bot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
