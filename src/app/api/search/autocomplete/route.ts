// 헤더 글로벌 검색 자동완성 — 팀(전 리그) + 선수(축구 PMV 전체 + 시즌 리더 야구·농구·하키·LoL).
// 한 글자부터 한글 자모 분해("소" → 손흥민) + 초성("ㅅㅎㅁ") + 영문 매칭, 1시간 메모리 인덱스.
// 매칭·축구 인덱스 빌더는 src/lib/suggest-index.ts 공용 (/api/transfers/suggest 와 동일 품질).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, LEAGUE_ORDER, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import {
  buildFootballPlayerIndex, playerTier, decomp, chosung, chosungQuery,
  TEAM_ALIASES, type PlayerEntry,
} from "@/lib/suggest-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Item {
  type: "team" | "player";
  id: number | string;
  name: string;
  subtitle: string; // "EPL · 리버풀" / "KBO · 두산 · 타율 1위"
  league: string;
  logoUrl?: string | null;
  href: string;
  value?: string; // 축구 선수 몸값 "1,523억"
}

// 선수 공통 엔트리 — 축구(PMV)와 시즌 리더를 한 배열로 머지해 같은 티어 로직으로 랭킹
interface SPlayer extends PlayerEntry {
  href: string;
  subtitle: string;
  league: string;
}

interface STeam {
  id: number;
  name: string;
  league: string;
  logo: string | null;
  ord: number; // LEAGUE_ORDER (낮을수록 우선)
  nds: string[]; // 이름+별칭+영문 자모 분해
  ncs: string[];
}

let IDX: { players: SPlayer[]; teams: STeam[] } | null = null;
let idxAt = 0;

function leagueLabel(code: string): string {
  return LEAGUE_DISPLAY[code] || code;
}

async function getIndex() {
  if (IDX && Date.now() - idxAt < 3600_000) return IDX;

  // ── 축구 선수 (PMV 시장가치 보유 전체) — 몸값 표시 + /transfers/{id} 개인페이지 ──
  const { players: fb } = await buildFootballPlayerIndex();
  const players: SPlayer[] = fb.map((e) => ({
    ...e,
    href: `/transfers/${e.id}`,
    subtitle: e.team,
    league: "FOOTBALL",
  }));
  const fbNames = new Set(players.map((e) => e.name.replace(/\s+/g, "")));

  // ── 시즌 리더 (야구·농구·하키·LoL + 축구 비PMV 리그) — 카테고리 순위 포함 ──
  const leaders = await prisma.leagueLeader.findMany({
    select: {
      externalId: true, playerName: true, playerNameEn: true, league: true,
      teamName: true, unit: true, rank: true, photoUrl: true,
    },
    orderBy: { rank: "asc" },
  });
  const seenLeader = new Set<string>();
  for (const p of leaders) {
    const k = `${p.league}|${p.playerName}`;
    if (seenLeader.has(k)) continue; // 다중 카테고리 → 최저 rank(첫 행)만
    seenLeader.add(k);
    // 축구 리더는 PMV 인덱스와 중복 → 동명이면 스킵 (transfers 프로필이 더 풍부)
    if (SOCCER_LEAGUES.has(p.league) && fbNames.has(p.playerName.replace(/\s+/g, ""))) continue;
    const nameLower = p.playerName.toLowerCase();
    const nameEn = (p.playerNameEn || "").toLowerCase();
    players.push({
      id: p.externalId ?? p.playerName,
      name: p.playerName,
      team: p.teamName,
      photo: p.photoUrl,
      value: "",
      v: 8e7 / Math.max(p.rank, 1), // 리더 순위 → 가치 환산 (1위 ≈ 슈퍼스타급 노출)
      nd: decomp(nameLower),
      ndW: nameLower.split(/\s+/).filter(Boolean).map(decomp),
      ed: nameEn,
      edW: nameEn.split(/\s+/).filter(Boolean),
      nc: chosung(p.playerName),
      href: p.externalId
        ? `/players/${p.externalId}?league=${encodeURIComponent(p.league)}`
        : `/search?q=${encodeURIComponent(p.playerName)}`,
      subtitle: [leagueLabel(p.league), p.teamName, p.unit ? `${p.unit} ${p.rank}위` : ""].filter(Boolean).join(" · "),
      league: p.league,
    });
  }

  // ── 팀 (전 리그 — 야구·농구 포함) ──
  const teamRows = await prisma.team.findMany({
    select: { id: true, name: true, shortName: true, league: true, logoUrl: true },
  });
  const teams: STeam[] = teamRows.map((t) => {
    const ko = toKoreanTeamName(t.name, t.league) || t.name;
    const variants = [ko, ...(TEAM_ALIASES[ko] || [])];
    if (t.name !== ko) variants.push(t.name);
    if (t.shortName && t.shortName !== t.name) variants.push(t.shortName);
    return {
      id: t.id,
      name: ko,
      league: t.league,
      logo: t.logoUrl,
      ord: LEAGUE_ORDER[t.league] ?? 9999,
      nds: variants.map((n) => decomp(n.toLowerCase())),
      ncs: variants.map(chosung),
    };
  });

  IDX = { players, teams };
  idxAt = Date.now();
  return IDX;
}

function teamTier(t: STeam, qd: string, qc: string | null): number {
  if (qc) return t.ncs.some((n) => n.startsWith(qc)) ? 0 : t.ncs.some((n) => n.includes(qc)) ? 1 : -1;
  if (t.nds.some((n) => n.startsWith(qd))) return 0;
  if (t.nds.some((n) => n.includes(qd))) return 1;
  return -1;
}

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!q) return NextResponse.json({ items: [] }, { headers: CACHE_HEADERS });

  const idx = await getIndex();
  const qLower = q.toLowerCase();
  const qc = chosungQuery(qLower);
  const qd = decomp(qLower);

  const playerItems: Item[] = idx.players
    .map((e) => ({ e, t: playerTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || b.e.v - a.e.v)
    .slice(0, 6)
    .map(({ e }) => ({
      type: "player" as const,
      id: e.id,
      name: e.name,
      subtitle: e.subtitle,
      league: e.league,
      logoUrl: e.photo,
      href: e.href,
      ...(e.value ? { value: e.value } : {}),
    }));

  // 같은 팀이 리그별 row(EPL·UCL·클럽월드컵)로 중복 — 이름 기준 첫 등장(ord 최저 리그)만
  const seenTeam = new Set<string>();
  const teamItems: Item[] = idx.teams
    .map((e) => ({ e, t: teamTier(e, qd, qc) }))
    .filter((x) => x.t >= 0)
    .sort((a, b) => a.t - b.t || a.e.ord - b.e.ord || a.e.name.length - b.e.name.length)
    .filter(({ e }) => { if (seenTeam.has(e.name)) return false; seenTeam.add(e.name); return true; })
    .slice(0, 4)
    .map(({ e }) => ({
      type: "team" as const,
      id: e.id,
      name: e.name,
      subtitle: leagueLabel(e.league),
      league: e.league,
      logoUrl: e.logo,
      href: `/teams/${e.id}`,
    }));

  // 선수 먼저 (이적시장 자동완성과 동일 UX) — 팀 의도 쿼리는 선수 미일치라 자연히 팀이 위로
  return NextResponse.json({ items: [...playerItems, ...teamItems] }, { headers: CACHE_HEADERS });
}
