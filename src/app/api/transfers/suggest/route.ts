// /api/transfers/suggest — 이적시장 선수·팀 검색 자동완성.
// PlayerMarketValue 전 리그(빅5 + K리그1·사우디·MLS)를 1시간 메모리 캐시로 인덱싱 후
// 한글 자모 분해 매칭("소" → 손흥민) + 초성 검색("ㅅㅎㅁ" → 손흥민) + 영문명 부분일치.
// 팀 추천은 빅5 팀만 (?view=team 스쿼드 뷰가 빅5 전용) + 축약 별칭(맨시티·맨유·돌문 등).
// 매칭·인덱스 빌더는 src/lib/suggest-index.ts 공용 (헤더 글로벌 검색과 공유).

import { NextResponse, type NextRequest } from "next/server";
import {
  buildFootballPlayerIndex, playerTier, decomp, chosung, chosungQuery,
  TEAM_ALIASES, type PlayerEntry,
} from "@/lib/suggest-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TeamEntry {
  id: number;
  name: string;
  logo: string | null;
  count: number;
  nds: string[]; // 이름+별칭 자모 분해
  ncs: string[]; // 이름+별칭 초성
}

// 모듈 메모리 캐시 (warm 인스턴스당 1시간) — unstable_cache 직렬화 한도 회피
let IDX: { players: PlayerEntry[]; teams: TeamEntry[] } | null = null;
let idxAt = 0;

async function getIndex() {
  if (IDX && Date.now() - idxAt < 3600_000) return IDX;
  const { players, big5Teams } = await buildFootballPlayerIndex();
  const teams: TeamEntry[] = big5Teams.map((t) => {
    const names = [t.name, ...(TEAM_ALIASES[t.name] || [])];
    return {
      id: t.ourId,
      name: t.name,
      logo: t.logo,
      count: t.count,
      nds: names.map((n) => decomp(n.toLowerCase())),
      ncs: names.map(chosung),
    };
  });
  IDX = { players, teams };
  idxAt = Date.now();
  return IDX;
}

function teamTier(t: TeamEntry, qd: string, qc: string | null): number {
  if (qc) return t.ncs.some((n) => n.startsWith(qc)) ? 0 : t.ncs.some((n) => n.includes(qc)) ? 1 : -1;
  if (t.nds.some((n) => n.startsWith(qd))) return 0;
  if (t.nds.some((n) => n.includes(qd))) return 1;
  return -1;
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (!q) return NextResponse.json({ players: [], teams: [] }, { headers: CACHE_HEADERS });

  const idx = await getIndex();
  const qLower = q.toLowerCase();
  const qc = chosungQuery(qLower); // 초성 전용 쿼리
  const qd = decomp(qLower);

  const players = idx.players
    .map((e) => ({ e, t: playerTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || b.e.v - a.e.v)
    .slice(0, 8)
    .map(({ e }) => ({ id: e.id, name: e.name, team: e.team, photo: e.photo, value: e.value }));

  const teams = idx.teams
    .map((e) => ({ e, t: teamTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || b.e.count - a.e.count)
    .slice(0, 3)
    .map(({ e }) => ({ id: e.id, name: e.name, logo: e.logo, count: e.count }));

  return NextResponse.json({ players, teams }, { headers: CACHE_HEADERS });
}
