// 선수 비교 피커 검색 — 비축구 종목(NBA·NHL·LOL·MLB·KBO·NPB) 정적 선수목록 자모/초성 매칭.
// 축구는 기존 /api/transfers/suggest 사용(피커가 분기). 결과 { players: [{id,name,photo,sub,type?}] }.
import { NextResponse, type NextRequest } from "next/server";
import { decomp, chosung, chosungQuery } from "@/lib/suggest-index";
import { prisma } from "@/lib/db";
import nbaPlayersData from "../../../../../data/nba-players.json";
import lolPlayersData from "../../../../../data/lol-players.json";
import nhlPlayersData from "../../../../../data/nhl-players.json";
import mlbPlayersData from "../../../../../data/mlb-players.json";
import baseballRosters from "../../../../../data/baseball-rosters.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Cand {
  id: string;
  name: string;
  photo: string | null;
  sub: string | null;
  type?: string; // 야구 타자(b)/투수(p)
  nd: string;
  nc: string;
  ed: string;
}

const CACHE: Record<string, Cand[]> = {};

function buildNba(): Cand[] {
  const d = nbaPlayersData as Record<string, { name?: string; ko?: string; photo?: string; pos?: string; bdlId?: number }>;
  const out: Cand[] = [];
  for (const e of Object.values(d)) {
    if (!e.bdlId) continue;
    const ko = e.ko || e.name || "";
    out.push({ id: String(e.bdlId), name: ko, photo: e.photo ?? null, sub: e.pos ?? null, nd: decomp(ko.toLowerCase()), nc: chosung(ko), ed: (e.name || "").toLowerCase() });
  }
  return out;
}
function buildLol(): Cand[] {
  const d = (lolPlayersData as { players: Record<string, { name?: string; realName?: string; photo?: string }> }).players;
  const out: Cand[] = [];
  for (const [id, e] of Object.entries(d)) {
    const gamer = e.name || "";
    out.push({ id, name: gamer, photo: e.photo ?? null, sub: e.realName || null, nd: decomp((e.realName || "").toLowerCase()), nc: chosung(e.realName || ""), ed: gamer.toLowerCase() });
  }
  return out;
}
function buildNhl(): Cand[] {
  const d = nhlPlayersData as Record<string, { name?: string; ko?: string; photo?: string; pos?: string; team?: string }>;
  const out: Cand[] = [];
  for (const [id, e] of Object.entries(d)) {
    const ko = e.ko || e.name || "";
    out.push({ id, name: ko, photo: e.photo || null, sub: [e.pos, e.team].filter(Boolean).join(" · ") || null, nd: decomp(ko.toLowerCase()), nc: chosung(ko), ed: (e.name || "").toLowerCase() });
  }
  return out;
}
function buildMlb(): Cand[] {
  const d = mlbPlayersData as Record<string, { name?: string; ko?: string; group?: string; team?: string; pos?: string }>;
  const out: Cand[] = [];
  for (const [id, e] of Object.entries(d)) {
    const ko = e.ko || e.name || "";
    out.push({
      id, name: ko, photo: `https://midfield.mlbstatic.com/v1/people/${id}/spots/120`,
      sub: [e.pos, e.team].filter(Boolean).join(" · ") || null, type: e.group === "p" ? "p" : "b",
      nd: decomp(ko.toLowerCase()), nc: chosung(ko), ed: (e.name || "").toLowerCase(),
    });
  }
  return out;
}

// KBO/NPB: baseball-rosters.json(팀id→선수) + DB Team.league 로 종목 분리. group(P/B)→type.
let baseballTeamLeague: Map<string, string> | null = null;
async function getBaseballTeamLeague(): Promise<Map<string, string>> {
  if (baseballTeamLeague) return baseballTeamLeague;
  const teams = await prisma.team.findMany({ where: { league: { in: ["KBO", "NPB"] } }, select: { id: true, league: true } });
  baseballTeamLeague = new Map(teams.map((t) => [String(t.id), t.league]));
  return baseballTeamLeague;
}
async function buildBaseballRoster(league: "KBO" | "NPB"): Promise<Cand[]> {
  const leagueMap = await getBaseballTeamLeague();
  const rosters = baseballRosters as Record<string, Array<{ id: string; name: string; group: string }>>;
  const yr = new Date().getUTCFullYear();
  const out: Cand[] = [];
  for (const [teamId, arr] of Object.entries(rosters)) {
    if (leagueMap.get(teamId) !== league) continue;
    for (const p of arr) {
      out.push({
        id: p.id, name: p.name,
        photo: league === "KBO" ? `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${yr}/${p.id}.jpg` : null,
        sub: null, type: p.group === "P" ? "p" : "b",
        nd: decomp(p.name.toLowerCase()), nc: chosung(p.name), ed: p.name.toLowerCase(),
      });
    }
  }
  return out;
}

async function candidates(sport: string): Promise<Cand[]> {
  if (CACHE[sport]) return CACHE[sport];
  let list: Cand[] = [];
  if (sport === "NBA") list = buildNba();
  else if (sport === "LOL") list = buildLol();
  else if (sport === "NHL") list = buildNhl();
  else if (sport === "MLB") list = buildMlb();
  else if (sport === "KBO") list = await buildBaseballRoster("KBO");
  else if (sport === "NPB") list = await buildBaseballRoster("NPB");
  CACHE[sport] = list;
  return list;
}

function tier(c: Cand, qd: string, qc: string | null, qLower: string): number {
  if (qc) return c.nc.startsWith(qc) ? 0 : c.nc.includes(qc) ? 1 : -1;
  if (c.nd.startsWith(qd) || c.ed.startsWith(qLower)) return 0;
  if (c.nd.includes(qd) || c.ed.includes(qLower)) return 1;
  return -1;
}

export async function GET(req: NextRequest) {
  const sport = (req.nextUrl.searchParams.get("sport") || "").toUpperCase();
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 40);
  if (!q || !sport) return NextResponse.json({ players: [] });

  const list = await candidates(sport);
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
