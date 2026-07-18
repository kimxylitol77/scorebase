// KBO 오늘의 주목 타자 Top 3 — 경기별 선정 빌더 (결정론, LLM 0).
// 점수 = 시즌 OPS × 상대 선발 보정(FIP 우선, ERA fallback). 파크팩터는 근거 문구 맥락용.

import { prisma } from "@/lib/db";
import { getParkFactor } from "@/lib/predict/park-factors";
import { kboFullNameToAbbr } from "@/lib/sports/kbo-starters";

interface StarterLite {
  name?: string;
  era?: number;
  fip?: number;
}

export interface FeaturedHitter {
  playerName: string;
  teamName: string;
  externalId?: string;
  avg?: number;
  ops: number;
  homeRuns?: number;
  rbi?: number;
  games?: number;
  score: number;
  reason: string;
}

export interface FeaturedGame {
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  startTimeKst: string; // "18:00"
  parkFactor: number;
  /** 구장 성향 메모 (중립 구장이면 없음) — 섹션 단위 1줄 */
  parkNote?: string;
  hitters: FeaturedHitter[]; // Top 3 (양 팀 통합)
}

function parseStarter(s: string | null): StarterLite | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as StarterLite;
  } catch {
    return null;
  }
}

/** 상대 선발 보정 — eff(FIP 우선) 가 리그 평균(4.3) 보다 높을수록 타자 가점. */
function oppStarterFactor(starter: StarterLite | null): number {
  const eff = starter?.fip ?? starter?.era;
  if (eff == null) return 1.0;
  return Math.min(1.15, Math.max(0.88, 1 + (eff - 4.3) * 0.06));
}

function fmtNum(v: number | undefined, digits: number): string {
  return v != null ? v.toFixed(digits) : "-";
}

/** 은/는 조사 — 받침 유무 판정 (한글 아니면 "은") */
function eunNeun(word: string): string {
  const last = word.charAt(word.length - 1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "은";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}

/** 타자별 "무기" 절 — 표 수치와 겹치되 관점을 부여 (규칙 기반) */
function weaponClause(h: { avg?: number; homeRuns?: number; rbi?: number }): string {
  if ((h.homeRuns ?? 0) >= 15) return `장타 생산(홈런 ${h.homeRuns}개)이 무기`;
  if ((h.avg ?? 0) >= 0.32) return `정교한 컨택(타율 ${(h.avg as number).toFixed(3)})이 무기`;
  if ((h.rbi ?? 0) >= 60) return `해결사 몫(타점 ${h.rbi})이 무기`;
  return "시즌 OPS 상위의 꾸준한 생산력이 무기";
}

/** 근거 한 줄 — 무기 절 + 상대 선발 매치업 절 (구장 메모는 섹션 단위로 분리). */
function buildReason(
  h: { avg?: number; homeRuns?: number; rbi?: number },
  opp: StarterLite | null,
): string {
  const parts: string[] = [weaponClause(h)];
  const eff = opp?.fip ?? opp?.era;
  if (opp?.name && eff != null) {
    const statLabel =
      opp.fip != null
        ? `ERA ${fmtNum(opp.era, 2)}·FIP ${fmtNum(opp.fip, 2)}`
        : `ERA ${fmtNum(opp.era, 2)}`;
    if (eff >= 4.8) {
      parts.push(`상대 선발 ${opp.name}(${statLabel}) 공략 기대`);
    } else if (eff <= 3.6) {
      parts.push(
        `상대 선발 ${opp.name}(${statLabel})${eunNeun(opp.name)} 난적 — 정면승부 관전 포인트`,
      );
    } else {
      parts.push(`상대 선발 ${opp.name}(${statLabel}) 상대 시즌 페이스 유지가 관건`);
    }
  }
  return parts.join(". ") + ".";
}

/**
 * 오늘(KST) KBO SCHEDULED 매치별 주목 타자 Top 3.
 * 타자 풀 = 양 팀 BaseballPlayerSeasonStats, 출장 필터 = 풀 내 최다 출장 × 0.55.
 */
export async function buildKboFeaturedHitters(
  refDate: Date = new Date(),
): Promise<FeaturedGame[]> {
  const kstDate = new Date(refDate.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const dayStartUtc = new Date(`${kstDate}T00:00:00+09:00`);
  const dayEndUtc = new Date(dayStartUtc.getTime() + 86400000);
  const season = String(new Date(refDate.getTime() + 9 * 3600000).getUTCFullYear());

  const matches = await prisma.match.findMany({
    where: {
      league: "KBO",
      status: "SCHEDULED",
      startTime: { gte: dayStartUtc, lt: dayEndUtc },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
  });
  if (matches.length === 0) return [];

  // 시즌 스탯 teamName 은 축약형("KT"·"키움")으로 적재됨 — 풀네임·약칭 모두 매칭
  const hitters = await prisma.baseballPlayerSeasonStats.findMany({
    where: { league: "KBO", season },
  });
  const forTeam = (fullName: string) => {
    const abbr = kboFullNameToAbbr(fullName);
    return hitters.filter(
      (h) =>
        h.teamName === fullName ||
        (abbr != null && h.teamName === abbr) ||
        fullName.includes(h.teamName),
    );
  };

  const games: FeaturedGame[] = [];
  for (const m of matches) {
    const homePool = forTeam(m.homeTeam.name);
    const awayPool = forTeam(m.awayTeam.name);
    const pool = [...homePool, ...awayPool].filter((h) => h.ops != null);
    if (pool.length < 6) continue; // 시즌 스탯 미적재 팀 — 스킵

    const maxGames = Math.max(...pool.map((h) => h.games ?? 0));
    const qualified = pool.filter((h) => (h.games ?? 0) >= maxGames * 0.55);
    if (qualified.length < 3) continue;

    const homeStarter = parseStarter(m.homeStarter);
    const awayStarter = parseStarter(m.awayStarter);
    const parkFactor = getParkFactor("KBO", m.homeTeam.name);
    const homeIds = new Set(homePool.map((h) => h.id));

    const scored = qualified
      .map((h) => {
        const opp = homeIds.has(h.id) ? awayStarter : homeStarter;
        const score = (h.ops as number) * oppStarterFactor(opp);
        return {
          playerName: h.playerName,
          // 표시용 — 시즌 스탯의 축약형 대신 매치 팀 풀네임
          teamName: homeIds.has(h.id) ? m.homeTeam.name : m.awayTeam.name,
          externalId: h.externalId ?? undefined,
          avg: h.avg ?? undefined,
          ops: h.ops as number,
          homeRuns: h.homeRuns ?? undefined,
          rbi: h.rbi ?? undefined,
          games: h.games ?? undefined,
          score: Number(score.toFixed(4)),
          reason: buildReason(
            { avg: h.avg ?? undefined, homeRuns: h.homeRuns ?? undefined, rbi: h.rbi ?? undefined },
            opp,
          ),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const kstTime = new Date(m.startTime.getTime() + 9 * 3600000)
      .toISOString()
      .slice(11, 16);

    const parkNote =
      parkFactor >= 1.03
        ? `타자 친화 구장 (파크팩터 ${parkFactor.toFixed(2)})`
        : parkFactor <= 0.95
          ? `투수 친화 구장 (파크팩터 ${parkFactor.toFixed(2)})`
          : undefined;

    games.push({
      matchId: m.id,
      homeTeam: m.homeTeam.name,
      awayTeam: m.awayTeam.name,
      startTimeKst: kstTime,
      parkFactor,
      parkNote,
      hitters: scored,
    });
  }
  return games;
}
