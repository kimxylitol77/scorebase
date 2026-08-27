// /api/transfers/team/[id] — 우리 DB Team.id 로 api-football transfers fetch.
// 응답 캐시 1시간 (이적 정보 자주 안 바뀜).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { dedupeAfTransfers } from "@/lib/transfers/af-transfer-dedupe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawTransfer {
  date: string;
  type: string | null;
  teams: {
    in: { id: number; name: string; logo?: string };
    out: { id: number; name: string; logo?: string };
  };
}
interface RawItem {
  player: { id: number; name: string };
  update: string;
  transfers: RawTransfer[];
}

interface OutItem {
  playerId: number;
  playerName: string;
  date: string;
  type: string;
  direction: "in" | "out";
  oppTeam: string;
  oppLogo?: string;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const dbId = parseInt(id);
  if (!Number.isFinite(dbId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // 유료 API(api-football) 프록시 — Team id 순회로 캐시 우회·쿼터 소진하는 남용 차단.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`transfers-team:${ip}`, { max: 30, windowMs: 60_000, lockMs: 300_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: dbId },
    select: {
      id: true,
      name: true,
      league: true,
      // api-football team id 는 Team.externalId 가 아니라 TeamSourceId(source='api-football') 에 있다.
      // 빅리그 Team.externalId 는 football-data.org id 라, 그대로 쓰면 엉뚱한 팀이 조회된다
      // (예: Arsenal externalId=57 → api-football 57 = Ipswich).
      sourceIds: {
        where: { source: "api-football" },
        select: { externalId: true },
      },
    },
  });
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });

  // api-football 매핑 리그만 지원
  if (!API_FOOTBALL_LEAGUE_ID[team.league]) {
    return NextResponse.json({ items: [], note: "league not supported" });
  }
  const afIdStr = team.sourceIds[0]?.externalId;
  const afTeamId = afIdStr ? parseInt(afIdStr) : NaN;
  if (!Number.isFinite(afTeamId)) {
    return NextResponse.json({ items: [], note: "no api-football mapping" });
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ items: [], note: "no api key" });

  try {
    const res = await fetch(`https://v3.football.api-sports.io/transfers?team=${afTeamId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 }, // 1시간 캐시
    });
    if (!res.ok) {
      return NextResponse.json({ items: [], note: `api-football ${res.status}` });
    }
    const data = (await res.json()) as { response?: RawItem[] };
    // api-football transfers 는 날짜 이상치("290715" 같은 비표준)·중복 레코드가 섞여 있어 정제한다.
    // 중복은 두 종류다 — 완전 동일 레코드, 그리고 **같은 이적을 이틀 연속 날짜로 준 것**.
    // 후자는 키에 date 가 있으면 안 걸러져 같은 선수가 두 줄로 노출됐다 (dedupeAfTransfers 참고).
    const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const flat: Array<OutItem & { playerId: number; inId: number; outId: number }> = [];
    for (const item of data.response ?? []) {
      for (const tr of item.transfers ?? []) {
        if (!isValidDate(tr.date)) continue; // 날짜 형식 이상치 제외
        const isIn = tr.teams.in.id === afTeamId;
        flat.push({
          playerId: item.player.id,
          playerName: item.player.name,
          date: tr.date,
          type: tr.type ?? "—",
          direction: isIn ? "in" : "out",
          oppTeam: isIn ? tr.teams.out.name : tr.teams.in.name,
          oppLogo: isIn ? tr.teams.out.logo : tr.teams.in.logo,
          inId: tr.teams.in.id,
          outId: tr.teams.out.id,
        });
      }
    }
    const out: OutItem[] = dedupeAfTransfers(flat);
    // 최신 순 정렬 + 최대 20개
    out.sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ items: out.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 200 });
  }
}
