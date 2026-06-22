// 선수 비교 피커 검색 — 비축구 종목(NBA·LOL, 추후 NHL·MLB·KBO·NPB) 정적 선수목록 자모/초성 매칭.
// 축구는 기존 /api/transfers/suggest 사용(피커가 분기). 결과 { players: [{id,name,photo,sub,type?}] }.
import { NextResponse, type NextRequest } from "next/server";
import { decomp, chosung, chosungQuery } from "@/lib/suggest-index";
import nbaPlayersData from "../../../../../data/nba-players.json";
import lolPlayersData from "../../../../../data/lol-players.json";
import nhlPlayersData from "../../../../../data/nhl-players.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Cand {
  id: string;
  name: string; // 표시 한글명
  photo: string | null;
  sub: string | null;
  type?: string; // 야구 타자/투수
  nd: string; // 한글명 자모분해
  nc: string; // 초성
  ed: string; // 영문 소문자
}

// ── 종목별 후보 빌드 (warm 캐시) ──
let CACHE: Record<string, Cand[]> = {};

function buildNba(): Cand[] {
  const d = nbaPlayersData as Record<string, { name?: string; ko?: string; photo?: string; pos?: string; bdlId?: number }>;
  const out: Cand[] = [];
  for (const e of Object.values(d)) {
    if (!e.bdlId) continue;
    const ko = e.ko || e.name || "";
    out.push({
      id: String(e.bdlId), name: ko, photo: e.photo ?? null, sub: e.pos ?? null,
      nd: decomp(ko.toLowerCase()), nc: chosung(ko), ed: (e.name || "").toLowerCase(),
    });
  }
  return out;
}
function buildLol(): Cand[] {
  const d = (lolPlayersData as { players: Record<string, { name?: string; realName?: string; photo?: string }> }).players;
  const out: Cand[] = [];
  for (const [id, e] of Object.entries(d)) {
    const gamer = e.name || "";
    const real = e.realName || "";
    out.push({
      id, name: gamer, photo: e.photo ?? null, sub: real || null,
      nd: decomp(real.toLowerCase()), nc: chosung(real), ed: gamer.toLowerCase(),
    });
  }
  return out;
}

function buildNhl(): Cand[] {
  const d = nhlPlayersData as Record<string, { name?: string; ko?: string; photo?: string; pos?: string; team?: string }>;
  const out: Cand[] = [];
  for (const [id, e] of Object.entries(d)) {
    const ko = e.ko || e.name || "";
    out.push({
      id, name: ko, photo: e.photo || null, sub: [e.pos, e.team].filter(Boolean).join(" · ") || null,
      nd: decomp(ko.toLowerCase()), nc: chosung(ko), ed: (e.name || "").toLowerCase(),
    });
  }
  return out;
}

function candidates(sport: string): Cand[] {
  if (CACHE[sport]) return CACHE[sport];
  let list: Cand[] = [];
  if (sport === "NBA") list = buildNba();
  else if (sport === "LOL") list = buildLol();
  else if (sport === "NHL") list = buildNhl();
  CACHE[sport] = list;
  return list;
}

// 매칭 티어: 0=초성/이름 시작, 1=부분포함, -1=불일치
function tier(c: Cand, qd: string, qc: string | null, qLower: string): number {
  if (qc) return c.nc.startsWith(qc) ? 0 : c.nc.includes(qc) ? 1 : -1;
  const hitStart = c.nd.startsWith(qd) || c.ed.startsWith(qLower);
  if (hitStart) return 0;
  const hit = c.nd.includes(qd) || c.ed.includes(qLower);
  return hit ? 1 : -1;
}

export async function GET(req: NextRequest) {
  const sport = (req.nextUrl.searchParams.get("sport") || "").toUpperCase();
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (!q || !sport) return NextResponse.json({ players: [] });

  const list = candidates(sport);
  if (!list.length) return NextResponse.json({ players: [] });

  const qLower = q.toLowerCase();
  const qc = chosungQuery(qLower);
  const qd = decomp(qLower);

  const players = list
    .map((c) => ({ c, t: tier(c, qd, qc, qLower) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.c.name.localeCompare(b.c.name))
    .slice(0, 8)
    .map(({ c }) => ({ id: c.id, name: c.name, photo: c.photo, sub: c.sub, ...(c.type ? { type: c.type } : {}) }));

  return NextResponse.json({ players }, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" } });
}
