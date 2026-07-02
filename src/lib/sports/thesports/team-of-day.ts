// 월드컵 '오늘의 베스트 XI' — 하루 완료 경기 출전 선수 평점 기반 4-2-3-1 베스트11.
// 소스: TheSportsMatchCache.lineup(평점·포지션·로고) + playerStats(골·도움). TheSports 직접
// 호출 없음 → Vercel 안전. world-cup-player-stats.ts 의 cache 집계 패턴 차용 + position/날짜 필터.
import { prisma } from "@/lib/db";
import { fifaCountryKo, fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import rawOv from "../../../../data/player-overrides.json";

const OV = rawOv as Record<string, { nameKo?: string }>;

/** '오늘의 베스트 XI' 분석 글의 slug 접두사. 뒤에 KST 날짜(YYYY-MM-DD)가 붙는다. */
export const TOD_ARTICLE_SLUG_PREFIX = "world-cup-team-of-day-";

/**
 * 발행 글 본문의 베스트11 표("| 평점 | 선수 | 국가 | 포지션 | …")에서 선수 칼럼 추출 —
 * 그래픽 XI 를 발행 시점 11인으로 고정하는 pinnedNames 용 (감사 A9). 파싱 실패 시 [].
 */
export function parseXiTableNames(content: string | null | undefined): string[] {
  if (!content) return [];
  const names: string[] = [];
  for (const line of content.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    const cells = line.split("|").map((s) => s.trim());
    // ["", 평점, 선수, 국가, 포지션, 핵심기록, ""] — 평점 셀이 숫자일 때만 데이터 행
    if (cells.length >= 6 && /^\*{0,2}\d+(\.\d+)?\*{0,2}$/.test(cells[1] ?? "")) {
      const nm = (cells[2] ?? "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 내부링크 마크다운 제거
        .replace(/\*\*/g, "")
        .trim();
      if (nm) names.push(nm);
    }
  }
  return names.length >= 7 ? names.slice(0, 11) : [];
}

interface TsLineupPlayer {
  id: string;
  name: string;
  logo?: string;
  rating?: string | number;
  position?: string;
  first?: number;
  captain?: number;
  x?: number; // 그 경기 내 좌우 위치 (0 좌 ~ 100 우)
  y?: number; // 그 경기 내 공수 깊이 (낮을수록 수비 진영)
}
interface TsPlayerStatRow {
  player_id: string;
  goals?: number;
  assists?: number;
  minutes_played?: number;
}

export interface TodPlayer {
  id: string;
  name: string; // 한글 우선
  nameEn: string | null;
  pos: string; // G | D | M | F
  country: string; // 영문 팀명
  countryKo: string;
  flag: string;
  rating: number; // 그날 경기 평점 (0~10)
  goals: number;
  assists: number;
  logo: string | null;
  captain: boolean;
  hasMv: boolean; // 시장가치 보유 → /transfers 링크
  x: number; // 피치 좌표 %
  y: number;
  star: number; // 1~5
}
export interface TeamOfDay {
  date: string; // 표시 기준 KST YYYY-MM-DD
  matchCount: number;
  matches: {
    home: string;
    away: string;
    homeKo: string;
    awayKo: string;
    homeScore: number | null;
    awayScore: number | null;
  }[];
  xi: TodPlayer[];
  bench: TodPlayer[];
  topRating: number;
  complete: boolean; // xi 11명 채워졌는지
}

// KST 날짜(YYYY-MM-DD) → 그날 00:00~24:00(KST)에 해당하는 UTC startTime 범위.
function kstDayRangeUtc(dateKst: string): { gte: Date; lt: Date } {
  const startUtcMs = Date.parse(`${dateKst}T00:00:00Z`) - 9 * 3600000;
  return { gte: new Date(startUtcMs), lt: new Date(startUtcMs + 86400000) };
}

/** 가장 최근 완료 경기가 속한 KST 날짜 (기본 표시일). 완료 경기 없으면 null. */
export async function latestFinishedDateKst(): Promise<string | null> {
  const m = await prisma.match.findFirst({
    where: { league: "WORLD_CUP", status: "FINISHED" },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });
  if (!m) return null;
  return new Date(m.startTime.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

/** 완료 경기가 하나라도 있는 KST 날짜 목록 (최신순). 날짜 네비게이션·sitemap 용. */
export async function finishedDatesKst(): Promise<string[]> {
  const rows = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: "FINISHED" },
    orderBy: { startTime: "desc" },
    select: { startTime: true },
  });
  const seen = new Set<string>(); // desc 입력이라 첫 등장 순서가 곧 최신순
  for (const r of rows) {
    seen.add(new Date(r.startTime.getTime() + 9 * 3600000).toISOString().slice(0, 10));
  }
  return [...seen];
}

const koCountry = (en: string) =>
  fifaCountryKo(en) ?? toKoreanTeamName(en, "WORLD_CUP") ?? en;

/**
 * 지정 KST 날짜(미지정 시 최근 완료일)의 월드컵 완료 경기 출전 선수에서
 * 평점 기반 4-2-3-1 베스트11 + 벤치 6명을 산출. 데이터 없으면 null.
 *
 * pinnedNames — 발행 글의 본문 표 11인(한글/영문명). 사후 평점 정정·동점 재정렬로
 * 렌더 시점 재계산 XI 가 표와 다른 11인이 되던 불일치 방지(2026-07-02 감사 A9):
 * 명단에 있는 선수를 포지션별 선발에서 최우선, 빠진 자리만 평점순으로 채운다.
 */
export async function getTeamOfDay(
  dateKst?: string,
  pinnedNames?: string[],
): Promise<TeamOfDay | null> {
  const date = dateKst ?? (await latestFinishedDateKst());
  if (!date) return null;
  const { gte, lt } = kstDayRangeUtc(date);

  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP", status: "FINISHED", startTime: { gte, lt } },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      theSportsCache: { select: { lineup: true, playerStats: true } },
    },
    orderBy: { startTime: "asc" },
  });
  if (matches.length === 0) return null;

  interface Raw {
    id: string;
    name: string;
    pos: string;
    rating: number;
    logo: string | null;
    captain: boolean;
    country: string;
    goals: number;
    assists: number;
    x: number; // raw 좌우 (0~100)
    y: number; // raw 공수 깊이 (낮을수록 수비)
  }
  const byId = new Map<string, Raw>(); // id 중복(연장 등) 시 최고 rating 유지
  const matchMeta: TeamOfDay["matches"] = [];

  for (const m of matches) {
    matchMeta.push({
      home: m.homeTeam.name,
      away: m.awayTeam.name,
      homeKo: koCountry(m.homeTeam.name),
      awayKo: koCountry(m.awayTeam.name),
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    });

    const luRoot = m.theSportsCache?.lineup as
      | { lineup?: { home?: TsLineupPlayer[]; away?: TsLineupPlayer[] }; home?: TsLineupPlayer[]; away?: TsLineupPlayer[] }
      | null;
    const lu = luRoot?.lineup ?? luRoot;
    const ps = m.theSportsCache?.playerStats as TsPlayerStatRow[] | null;
    const statById = new Map((Array.isArray(ps) ? ps : []).map((s) => [s.player_id, s]));

    for (const [side, country] of [
      ["home", m.homeTeam.name],
      ["away", m.awayTeam.name],
    ] as const) {
      for (const pl of lu?.[side] ?? []) {
        const rating = Number(pl.rating) || 0;
        if (rating <= 0) continue; // 미출전/평점없음 제외
        const pos = (pl.position ?? "").toUpperCase();
        if (pos !== "G" && pos !== "D" && pos !== "M" && pos !== "F") continue;
        const prev = byId.get(pl.id);
        if (prev && prev.rating >= rating) continue;
        const st = statById.get(pl.id);
        byId.set(pl.id, {
          id: pl.id,
          name: pl.name,
          pos,
          rating,
          logo: pl.logo || null,
          captain: pl.captain === 1,
          country,
          goals: st?.goals ?? 0,
          assists: st?.assists ?? 0,
          x: Number(pl.x) || 50,
          y: Number(pl.y) || 50,
        });
      }
    }
  }
  const uniq = [...byId.values()];
  if (uniq.length === 0) return null;

  // 한글명 + 시장가치 보유 여부
  const ids = uniq.map((p) => p.id);
  const [tsRows, mvRows] = await Promise.all([
    prisma.theSportsPlayer.findMany({
      where: { id: { in: ids }, nameKo: { not: null } },
      select: { id: true, nameKo: true },
    }),
    prisma.playerMarketValue.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  ]);
  const koById = new Map(tsRows.map((r) => [r.id, r.nameKo!]));
  const mvIds = new Set(mvRows.map((r) => r.id));

  // 고정 명단(발행 글 표) 우선 선발 — 이름은 표기 시점에 따라 한글(OV/nameKo)·영문·구표기
  // (위키 통일 전 음역: "조나단"→"조너선" 등)가 섞여, 정규화 완전일치 또는 3자+ 토큰
  // (성씨 등) 공유로 매칭한다.
  const normName = (s: string) => s.replace(/[\s·\-]/g, "");
  const tokensOf = (s: string) => s.split(/[\s·\-]+/).filter((t) => t.length >= 3);
  const pinned = (pinnedNames ?? []).map((n) => n.trim()).filter(Boolean);
  const pinNorms = new Set(pinned.map(normName));
  const pinTokens = new Set(pinned.flatMap(tokensOf));
  const nameMatches = (name: string): boolean =>
    pinNorms.has(normName(name)) || tokensOf(name).some((t) => pinTokens.has(t));
  const isPinned = (p: Raw): boolean =>
    pinned.length > 0 &&
    (nameMatches(OV[p.id]?.nameKo || koById.get(p.id) || p.name) || nameMatches(p.name));

  const sortScore = (a: Raw, b: Raw) =>
    Number(isPinned(b)) - Number(isPinned(a)) ||
    b.rating - a.rating ||
    b.goals - a.goals ||
    b.assists - a.assists;

  const toTod = (p: Raw, x: number, y: number): TodPlayer => ({
    id: p.id,
    name: OV[p.id]?.nameKo || koById.get(p.id) || p.name,
    nameEn: p.name,
    pos: p.pos,
    country: p.country,
    countryKo: koCountry(p.country),
    flag: fifaFlag(p.country),
    rating: p.rating,
    goals: p.goals,
    assists: p.assists,
    logo: p.logo,
    captain: p.captain,
    hasMv: mvIds.has(p.id),
    x,
    y,
    star: Math.max(1, Math.min(5, Math.round(p.rating / 2))),
  });

  // 배치: 어떤 11명을 뽑을지는 포지션별 평점 상위(G1·D4·M5·F1)로 유지하되,
  // 슬롯 좌표는 평점순이 아니라 raw x(좌우)·y(공수 깊이)로 정해 실제 역할을 반영한다.
  // (평점 1위 수비형 MF 가 공격형 슬롯에 올라가던 문제 해결)
  const xi: TodPlayer[] = [];
  const used = new Set<string>();
  const place = (p: Raw, x: number, y: number) => {
    xi.push(toTod(p, x, y));
    used.add(p.id);
  };

  // GK
  uniq.filter((p) => p.pos === "G").sort(sortScore).slice(0, 1)
    .forEach((p) => place(p, 50, 90));

  // 수비 4 — raw x 오름차순(좌→우)으로 배치해 CB 는 중앙, 풀백은 측면에.
  const DX = [16, 39, 61, 84];
  uniq.filter((p) => p.pos === "D").sort(sortScore).slice(0, 4)
    .sort((a, b) => a.x - b.x)
    .forEach((p, i) => place(p, DX[i] ?? 50, 70));

  // 미드 5 — raw y 로 수비형(DM, 낮은 y)·공격형(AM, 높은 y) 구분, 각 그룹 raw x 순.
  const mids = uniq.filter((p) => p.pos === "M").sort(sortScore).slice(0, 5);
  const byDepth = [...mids].sort((a, b) => a.y - b.y);
  const dmCount = Math.min(2, Math.max(0, mids.length - 3));
  const DMX = [35, 65];
  const AMX = [22, 50, 78];
  byDepth.slice(0, dmCount).sort((a, b) => a.x - b.x)
    .forEach((p, i) => place(p, DMX[i] ?? 50, 52));
  byDepth.slice(dmCount).sort((a, b) => a.x - b.x)
    .forEach((p, i) => place(p, AMX[i] ?? 50, 32));

  // FW
  uniq.filter((p) => p.pos === "F").sort(sortScore).slice(0, 1)
    .forEach((p) => place(p, 50, 14));
  const bench = uniq
    .filter((p) => !used.has(p.id))
    .sort(sortScore)
    .slice(0, 6)
    .map((p) => toTod(p, 0, 0));
  const topRating = xi.length ? Math.max(...xi.map((p) => p.rating)) : 0;

  return {
    date,
    matchCount: matches.length,
    matches: matchMeta,
    xi,
    bench,
    topRating,
    complete: xi.length === 11,
  };
}
