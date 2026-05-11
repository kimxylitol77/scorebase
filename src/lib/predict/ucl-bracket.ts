// UCL knockout-stage 브래킷 빌더.
//
// ESPN scoreboard 응답을 그대로 저장한 Match.raw 에서 round/leg/aggregate 를
// 추출해 시리즈 단위로 묶는다. 새 UCL 포맷(2024-25~) 기준 4단 트리.

import type { Prisma } from "@prisma/client";

export type UclRoundSlug =
  | "round-of-16"
  | "quarterfinals"
  | "semifinals"
  | "final";

export const ROUND_ORDER: UclRoundSlug[] = [
  "round-of-16",
  "quarterfinals",
  "semifinals",
  "final",
];

export const ROUND_LABEL: Record<UclRoundSlug, string> = {
  "round-of-16": "16강",
  quarterfinals: "8강",
  semifinals: "4강",
  final: "결승",
};

export interface BracketTeam {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface BracketLeg {
  matchId: number;
  startTime: Date;
  status: string;
  legLabel: "1st" | "2nd" | null;
  /** 이 leg 의 홈 팀 ID */
  homeTeamId: number;
  homeScore: number | null;
  awayTeamId: number;
  awayScore: number | null;
}

export interface BracketSeries {
  round: UclRoundSlug;
  /** 시리즈 식별용 — round + 정렬된 두 팀 id 조합 */
  key: string;
  team1: BracketTeam;
  team2: BracketTeam;
  legs: BracketLeg[];
  /** notes 에서 추출한 합산 점수 (없으면 leg 합산으로 계산) */
  aggregate?: { team1: number; team2: number };
  /** 진출 팀 ID — notes 의 "X advance Y-Z" 가 1순위, 못 찾으면 합산 우세 */
  winnerTeamId?: number;
  /** 모든 leg FINISHED 이면 true */
  completed: boolean;
}

type MatchWithTeams = Prisma.MatchGetPayload<{
  include: { homeTeam: true; awayTeam: true };
}>;

interface RawSlim {
  season?: { slug?: string };
  competitions?: Array<{
    notes?: Array<{ text?: string }>;
  }>;
}

function parseRaw(raw: string | null): RawSlim {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RawSlim;
  } catch {
    return {};
  }
}

function extractLegLabel(noteText: string | undefined): "1st" | "2nd" | null {
  if (!noteText) return null;
  if (/1st Leg/i.test(noteText)) return "1st";
  if (/2nd Leg/i.test(noteText)) return "2nd";
  return null;
}

/**
 * notes 의 "Xxx advance A-B on aggregate" 패턴에서
 * { winnerName, scoreWin, scoreLose } 추출. (winnerName 은 advance 한 팀의 영문명)
 */
function extractAggregate(noteText: string | undefined): {
  winnerName: string;
  scoreWin: number;
  scoreLose: number;
} | null {
  if (!noteText) return null;
  const m = noteText.match(
    /^(?:1st Leg|2nd Leg)\s*-\s*(.+?)\s+advance\s+(\d+)-(\d+)\s+on aggregate/i,
  );
  if (!m) return null;
  return {
    winnerName: m[1].trim(),
    scoreWin: Number(m[2]),
    scoreLose: Number(m[3]),
  };
}

/** 시리즈 식별자 — round + 정렬된 두 팀 id (양 leg 의 홈/원정 뒤바뀜 흡수) */
function seriesKey(
  round: UclRoundSlug,
  teamA: number,
  teamB: number,
): string {
  const [lo, hi] = teamA < teamB ? [teamA, teamB] : [teamB, teamA];
  return `${round}:${lo}-${hi}`;
}

function isKnockoutSlug(slug: string | undefined): slug is UclRoundSlug {
  return (
    slug === "round-of-16" ||
    slug === "quarterfinals" ||
    slug === "semifinals" ||
    slug === "final"
  );
}

export function buildUclBracket(matches: MatchWithTeams[]): BracketSeries[] {
  const seriesMap = new Map<string, BracketSeries>();

  for (const m of matches) {
    const raw = parseRaw(m.raw);
    const slug = raw.season?.slug;
    if (!isKnockoutSlug(slug)) continue;

    const noteText = raw.competitions?.[0]?.notes?.[0]?.text;
    const legLabel = extractLegLabel(noteText);
    const key = seriesKey(slug, m.homeTeamId, m.awayTeamId);

    let series = seriesMap.get(key);
    if (!series) {
      // 두 팀 정렬: id 작은 쪽이 team1
      const [t1, t2] =
        m.homeTeamId < m.awayTeamId
          ? [m.homeTeam, m.awayTeam]
          : [m.awayTeam, m.homeTeam];
      series = {
        round: slug,
        key,
        team1: { id: t1.id, name: t1.name, logoUrl: t1.logoUrl ?? null },
        team2: { id: t2.id, name: t2.name, logoUrl: t2.logoUrl ?? null },
        legs: [],
        completed: false,
      };
      seriesMap.set(key, series);
    }

    series.legs.push({
      matchId: m.id,
      startTime: m.startTime,
      status: m.status,
      legLabel,
      homeTeamId: m.homeTeamId,
      homeScore: m.homeScore,
      awayTeamId: m.awayTeamId,
      awayScore: m.awayScore,
    });

    // 2nd leg notes 에 advance 정보가 있으면 추출
    const agg = extractAggregate(noteText);
    if (agg && !series.aggregate) {
      // advance 한 팀이 team1 인지 team2 인지 매칭
      const winnerIsTeam1 = series.team1.name === agg.winnerName;
      const winnerIsTeam2 = series.team2.name === agg.winnerName;
      if (winnerIsTeam1) {
        series.aggregate = { team1: agg.scoreWin, team2: agg.scoreLose };
        series.winnerTeamId = series.team1.id;
      } else if (winnerIsTeam2) {
        series.aggregate = { team1: agg.scoreLose, team2: agg.scoreWin };
        series.winnerTeamId = series.team2.id;
      }
    }
  }

  // legs 시간순 정렬 + completed 계산 + aggregate fallback (notes 못 잡았을 때)
  for (const s of seriesMap.values()) {
    s.legs.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    s.completed = s.legs.every((l) => l.status === "FINISHED");

    if (!s.aggregate && s.completed) {
      let t1 = 0;
      let t2 = 0;
      for (const leg of s.legs) {
        if (leg.homeScore == null || leg.awayScore == null) continue;
        if (leg.homeTeamId === s.team1.id) {
          t1 += leg.homeScore;
          t2 += leg.awayScore;
        } else {
          t1 += leg.awayScore;
          t2 += leg.homeScore;
        }
      }
      s.aggregate = { team1: t1, team2: t2 };
      if (!s.winnerTeamId) {
        if (t1 > t2) s.winnerTeamId = s.team1.id;
        else if (t2 > t1) s.winnerTeamId = s.team2.id;
        // 동점이면 winnerTeamId 미정 (원정 다득점 / 승부차기 정보 없음)
      }
    }

    // 결승은 1-leg — 진행 중이거나 SCHEDULED 면 winner 미정
    if (s.round === "final" && s.completed && !s.winnerTeamId) {
      const leg = s.legs[0];
      if (
        leg &&
        leg.homeScore != null &&
        leg.awayScore != null &&
        leg.homeScore !== leg.awayScore
      ) {
        const winnerId =
          leg.homeScore > leg.awayScore ? leg.homeTeamId : leg.awayTeamId;
        s.winnerTeamId = winnerId;
      }
    }
  }

  // round 순서대로 정렬 + 같은 round 내에선 첫 leg 시간 순
  return Array.from(seriesMap.values()).sort((a, b) => {
    const ra = ROUND_ORDER.indexOf(a.round);
    const rb = ROUND_ORDER.indexOf(b.round);
    if (ra !== rb) return ra - rb;
    const ta = a.legs[0]?.startTime.getTime() ?? 0;
    const tb = b.legs[0]?.startTime.getTime() ?? 0;
    return ta - tb;
  });
}

export function groupByRound(
  series: BracketSeries[],
): Record<UclRoundSlug, BracketSeries[]> {
  const grouped: Record<UclRoundSlug, BracketSeries[]> = {
    "round-of-16": [],
    quarterfinals: [],
    semifinals: [],
    final: [],
  };
  for (const s of series) grouped[s.round].push(s);
  return grouped;
}
