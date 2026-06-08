// /api/cron/player-names — 주간. 축구 라인업 cache 에 등장한 선수 중 한글명 없는 선수를
// Claude Haiku 로 음역해 TheSportsPlayer 에 채운다. (DB + Anthropic 만 사용 → Vercel 가능.
// TheSports player API 는 계정 미인가 + IP 화이트리스트라 Vercel 에서 못 부르므로, 경기에
// 등장(라인업)한 선수를 소스로 한다. 선수가 뛰면 자동 명명 → /transfers 등 "선수" placeholder 해소.)
//
// 신규 선수만 처리(이미 nameKo 있으면 skip)라 매주 돌아도 비용 거의 0.
// 라인업에 안 나오는 벤치/하위 선수는 별도 season-stat 백필(whitelisted 머신)로 보강.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 50;
const PER_RUN = 150; // maxDuration 60s 내 안전한 1회 신규 명명 상한
const LINEUP_WINDOW_DAYS = 200; // 최근 시즌 라인업만 (전체 스캔 부하 방지)

interface LineupPlayer { id?: string; name?: string }

/** 최근 축구 라인업 cache 에서 { ts player id → 영문명 } 수집. */
async function collectLineupPlayers(): Promise<Map<string, string>> {
  const since = new Date(Date.now() - LINEUP_WINDOW_DAYS * 86400 * 1000);
  const rows = await prisma.theSportsMatchCache.findMany({
    where: { lineup: { not: undefined }, updatedAt: { gte: since } },
    select: { lineup: true },
    orderBy: { updatedAt: "asc" }, // 최신이 뒤 → 최신 name 으로 덮어씀
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    const lu = (r.lineup as { lineup?: { home?: LineupPlayer[]; away?: LineupPlayer[] } } | null)?.lineup;
    if (!lu) continue;
    for (const side of [lu.home, lu.away]) {
      if (!Array.isArray(side)) continue;
      for (const p of side) {
        const id = typeof p?.id === "string" ? p.id : null;
        const name = typeof p?.name === "string" ? p.name.trim() : "";
        if (id && name) map.set(id, name);
      }
    }
  }
  return map;
}

/** Haiku 음역 — 영문명 배열 → { 영문명: 한글명 }. 한글 없거나 중국어 혼입은 버림. */
async function haikuTranslate(batch: { id: string; en: string }[]): Promise<Record<string, string>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return {};
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
  const prompt =
    `다음 축구 선수 영문 이름을 한국 스포츠 미디어 표기로 변환해주세요.\n` +
    `국적이 다양합니다 (한국·일본·중국·유럽·남미 등) — 각 국적의 한국어 관용 표기를 따르세요.\n` +
    `- 한국 선수: 두음법칙. Lee→이, Ryu→류. 예: "Son Heung-Min"→손흥민 (띄어쓰기 X)\n` +
    `- 일본: 일본어 발음. "Mitoma"→미토마\n` +
    `- 남미(브라질 등): 현지 발음. "Vinicius"→비니시우스. 브라질식 R→H\n` +
    `- 유럽: 관용 표기. "Mbappe"→음바페, "Haaland"→홀란드\n` +
    `- 풀네임이면 한국 미디어 핵심 표기 (보통 성 위주).\n` +
    `- 자신없으면 그 entry 제외 (틀린 음역보다 누락).\n\n` +
    `선수 list:\n` +
    batch.map((b, i) => `${i + 1}. "${b.en}"`).join("\n") +
    `\n\n출력 — JSON 객체 한 줄만 (설명 X). key 는 위 영문 그대로:\n` +
    `{"Son Heung-Min": "손흥민", "Mbappe": "음바페"}`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(40000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const m = (data?.content?.[0]?.text ?? "").match(/\{[\s\S]*\}/);
    if (!m) return {};
    const obj = JSON.parse(m[0]) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [en, ko] of Object.entries(obj)) {
      if (typeof ko !== "string") continue;
      const s = ko.trim();
      if (!s || !/[가-힣]/.test(s)) continue; // 한글 필수
      const cjk = s.match(/[一-鿿]/g);
      if (cjk && cjk.length >= 2) continue; // 중국어 혼입 방어
      out[en] = s;
    }
    return out;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const ok =
    (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    (process.env.INTERNAL_API_TOKEN && auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`) ||
    ua.includes("vercel-cron");
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정" }, { status: 500 });
  }

  const all = await collectLineupPlayers();
  const existing = await prisma.theSportsPlayer.findMany({
    where: { id: { in: Array.from(all.keys()) }, nameKo: { not: null } },
    select: { id: true },
  });
  const mapped = new Set(existing.map((e) => e.id));
  const pending = Array.from(all.entries()).filter(([id]) => !mapped.has(id)).map(([id, en]) => ({ id, en }));
  const todo = pending.slice(0, PER_RUN);

  let upserted = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    const enToKo = await haikuTranslate(chunk);
    for (const { id, en } of chunk) {
      const ko = enToKo[en];
      if (!ko) continue;
      try {
        await prisma.theSportsPlayer.upsert({
          where: { id },
          update: { name: en, nameKo: ko },
          create: { id, name: en, nameKo: ko, sport: "FOOTBALL" },
        });
        upserted++;
      } catch {
        /* 개별 upsert 실패는 skip */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    lineupPlayers: all.size,
    alreadyMapped: mapped.size,
    pending: pending.length,
    processed: todo.length,
    upserted,
  });
}
