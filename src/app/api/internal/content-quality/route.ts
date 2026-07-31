// GET /api/internal/content-quality
// 표시 품질 검사 — mac-mini data-quality.js 가 15분마다 호출.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// 왜 별도인가. 기존 감시(endpoint-monitor·data-sanity·synthetic-monitor)는 "응답이 오나 ·
// 마커가 있나 · 라이브 값이 일관되나"를 본다. 전부 "있어야 할 게 있나" 유형이라
// "잘못된 값이 화면에 나간다"는 원천적으로 안 걸린다 — 2026-07-31 일본어 잔존·선발 지표
// 누락을 감시봇 9개가 전부 놓치고 사용자가 먼저 발견했다(그날 실측 실제 탐지 0건).
//
// 검출 항목:
//   1. foreign_text_leak   — 화면에 그대로 나가는 DB 문자열에 일본어(가나·한자) 잔존
//   2. starter_incomplete  — 경기 임박인데 선발 성적이 비어 카드가 "—" 로 나감
//
// 응답: { ok, checkedAt, issues: [{ kind, severity, league, detail, samples }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 가나 + CJK 한자. 한국어 화면에 이게 보이면 음역이 안 된 원문이다.
const JP_TEXT = /[぀-ヿ㐀-鿿]/;

// 선발 지표는 경기 임박에만 요구한다 — 발표 전 빈 값은 정상이고,
// 그걸 알리면 매일 아침 오탐이 된다(KBO·NPB 는 당일 확정).
const STARTER_DUE_MS = 3 * 60 * 60 * 1000;

interface Issue {
  kind: string;
  severity: "high" | "medium";
  league?: string;
  detail: string;
  samples: string[];
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) return unauthorized();

  const issues: Issue[] = [];
  const now = new Date();

  // 1) 선발 투수 이름 — Match.homeStarter/awayStarter JSON 의 name
  const withStarters = await prisma.match.findMany({
    where: {
      league: { in: ["NPB", "KBO", "MLB"] },
      startTime: { gte: new Date(now.getTime() - 7 * 86400_000) },
      OR: [{ homeStarter: { not: null } }, { awayStarter: { not: null } }],
    },
    select: { league: true, startTime: true, homeStarter: true, awayStarter: true },
  });

  const leakByLeague = new Map<string, string[]>();
  const incompleteByLeague = new Map<string, string[]>();
  for (const m of withStarters) {
    for (const raw of [m.homeStarter, m.awayStarter]) {
      if (!raw) continue;
      let o: { name?: string; era?: number | null } | null = null;
      try {
        o = JSON.parse(raw as string);
      } catch {
        continue;
      }
      if (!o?.name) continue;
      if (JP_TEXT.test(o.name)) {
        const arr = leakByLeague.get(m.league) ?? [];
        if (arr.length < 5) arr.push(o.name);
        leakByLeague.set(m.league, arr);
      }
      // 임박(3h 이내)했는데 성적이 없는 카드 — 사진·지표가 통째로 "—" 로 나간다
      const due = m.startTime.getTime() - now.getTime();
      if (due > 0 && due < STARTER_DUE_MS && o.era == null) {
        const arr = incompleteByLeague.get(m.league) ?? [];
        if (arr.length < 5) arr.push(o.name);
        incompleteByLeague.set(m.league, arr);
      }
    }
  }

  // 2) 시즌 스탯 선수명 (라이브 타자 표에 그대로 나감)
  const statRows = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league: { in: ["NPB", "KBO", "MLB"] } },
    select: { league: true, playerName: true },
  });
  for (const r of statRows) {
    if (!r.playerName || !JP_TEXT.test(r.playerName)) continue;
    const key = `${r.league}:stats`;
    const arr = leakByLeague.get(key) ?? [];
    if (arr.length < 5) arr.push(r.playerName);
    leakByLeague.set(key, arr);
  }

  for (const [league, samples] of leakByLeague) {
    issues.push({
      kind: "foreign_text_leak",
      severity: "high",
      league,
      detail: `${league} — 한국어 화면에 나가는 이름에 일본어 원문이 남아 있습니다 (${samples.length}건+)`,
      samples,
    });
  }
  for (const [league, samples] of incompleteByLeague) {
    issues.push({
      kind: "starter_incomplete",
      severity: "medium",
      league,
      detail: `${league} — 경기 3시간 내인데 선발 성적이 비어 카드가 "—" 로 표시됩니다 (${samples.length}건+)`,
      samples,
    });
  }

  return NextResponse.json({
    ok: issues.length === 0,
    checkedAt: now.toISOString(),
    totals: { startersChecked: withStarters.length, statRowsChecked: statRows.length },
    issues,
  });
}
