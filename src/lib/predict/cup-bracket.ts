// 컵 대회 녹아웃 대진표 빌더 — api-football raw 의 league.round 로 라운드를 세우고
// 같은 라운드·같은 두 팀 경기를 하나의 tie 로 묶는다(홈앤어웨이 2차전 흡수).
//
// UCL 브래킷(ucl-bracket.ts)과 분리한 이유. UCL 은 ESPN raw 의 season.slug 가 소스라
// 16강~결승 4단이 고정이지만, 컵은 대회마다 라운드 체계가 제각각이다(스위스컵 1st Round,
// FA컵 Round of 128, 코파 델 레이 Round of 32 …). 그래서 라운드를 고정 목록이 아니라
// 라벨에서 순위를 계산해 동적으로 세운다.
//
// ts 소스 매치는 대진표에 못 올린다. ts 는 컵에 round_num=0 만 주고 그 stage_id 가
// stage/list 사전에 없어 라운드를 특정할 수 없다(2026-08-09 실측). af 수집이 전제.

import type { Prisma } from "@prisma/client";

export interface CupTeam {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface CupLeg {
  matchId: number;
  startTime: Date;
  status: string;
  homeTeamId: number;
  homeScore: number | null;
  awayTeamId: number;
  awayScore: number | null;
  /** 승부차기 — af score.penalty (홈/원정 기준) */
  penalty: { home: number; away: number } | null;
}

export interface CupTie {
  /** 라운드 + 정렬된 두 팀 id */
  key: string;
  team1: CupTeam;
  team2: CupTeam;
  legs: CupLeg[];
  /** af teams.*.winner 가 1순위, 없으면 합산 우세 */
  winnerTeamId: number | null;
  /** 두 경기 이상이면 합산 점수 */
  aggregate: { team1: number; team2: number } | null;
  completed: boolean;
}

export interface CupRound {
  /** af 원본 라벨 — "Quarter-finals" 등 */
  label: string;
  ko: string;
  ties: CupTie[];
}

type MatchWithTeams = Prisma.MatchGetPayload<{
  include: { homeTeam: true; awayTeam: true };
}>;

interface AfRaw {
  league?: { round?: string };
  teams?: {
    home?: { winner?: boolean | null };
    away?: { winner?: boolean | null };
  };
  score?: { penalty?: { home?: number | null; away?: number | null } };
}

/**
 * 라운드 라벨 → 정렬 순위. 낮을수록 먼저 열린 라운드.
 * 조별리그·정규시즌 등 녹아웃이 아닌 단계는 null — 대진표에서 제외한다.
 */
export function roundRank(label: string): number | null {
  const s = label.trim().toLowerCase();
  if (!s) return null;
  // 조별리그·리그 페이즈는 트리로 그릴 수 없다
  if (/group|regular season|league stage|league phase/.test(s)) return null;
  if (/prelim|qualif/.test(s)) return 0;
  // "1st Round" · "3rd Round" — 대회 초반 라운드
  const nth = s.match(/^(\d+)(?:st|nd|rd|th)\s+round/);
  if (nth) return Math.min(9, Number(nth[1]));
  // "Round of 64" — 남은 팀 수가 적을수록 뒤
  const roundOf = s.match(/round of (\d+)/);
  if (roundOf) {
    const n = Number(roundOf[1]);
    // 128→13, 64→14, 32→15, 16→16 (앞 구간의 1~9 와 겹치지 않는다)
    return 20 - Math.round(Math.log2(Math.max(2, n)));
  }
  if (/quarter/.test(s)) return 17;
  if (/semi/.test(s)) return 18;
  if (/^final|^the final|3rd place|third place/.test(s)) return 19;
  return null;
}

/** 라운드 라벨 한글화 — 매핑에 없으면 원문 그대로 둔다(틀린 번역보다 낫다). */
export function roundKo(label: string): string {
  const s = label.trim().toLowerCase();
  if (/prelim/.test(s)) return "예선";
  if (/qualif/.test(s)) return "예선";
  const nth = s.match(/^(\d+)(?:st|nd|rd|th)\s+round/);
  if (nth) return `${nth[1]}라운드`;
  const roundOf = s.match(/round of (\d+)/);
  if (roundOf) return `${roundOf[1]}강`;
  if (/quarter/.test(s)) return "8강";
  if (/semi/.test(s)) return "4강";
  if (/3rd place|third place/.test(s)) return "3·4위전";
  if (/final/.test(s)) return "결승";
  return label;
}

/**
 * 최근 한 시즌만 잘라낸다 — 가장 늦은 경기로부터 300일.
 * 컵 한 시즌은 예선(7월)부터 결승(5월)까지 길어야 10개월이라 이 창에 다 들어오고,
 * 직전 시즌의 같은 라운드가 섞여 한 tie 에 다른 해 경기가 붙는 일은 막힌다.
 */
export function cupSeasonSlice<T extends { startTime: Date }>(matches: T[]): T[] {
  if (matches.length === 0) return [];
  let last = 0;
  for (const m of matches) last = Math.max(last, m.startTime.getTime());
  const from = last - 300 * 24 * 3600 * 1000;
  return matches.filter((m) => m.startTime.getTime() >= from);
}

function parseRaw(raw: string | null): AfRaw {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AfRaw;
  } catch {
    return {};
  }
}

function tieKey(rank: number, a: number, b: number): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${rank}:${lo}-${hi}`;
}

/**
 * 컵 매치 목록 → 라운드별 대진표.
 * 라운드를 못 읽는 매치(ts 소스·조별리그)는 조용히 빠진다.
 */
export function buildCupBracket(matches: MatchWithTeams[]): CupRound[] {
  // rank → { label, ties }
  const byRank = new Map<number, { label: string; ties: Map<string, CupTie> }>();

  for (const m of matches) {
    const raw = parseRaw(m.raw);
    const label = raw.league?.round;
    if (!label) continue;
    const rank = roundRank(label);
    if (rank === null) continue;

    let round = byRank.get(rank);
    if (!round) {
      round = { label, ties: new Map() };
      byRank.set(rank, round);
    }

    const key = tieKey(rank, m.homeTeamId, m.awayTeamId);
    let tie = round.ties.get(key);
    if (!tie) {
      // id 작은 쪽을 team1 로 고정 — 2차전에서 홈/원정이 뒤집혀도 같은 tie 로 묶인다
      const [t1, t2] =
        m.homeTeamId < m.awayTeamId
          ? [m.homeTeam, m.awayTeam]
          : [m.awayTeam, m.homeTeam];
      tie = {
        key,
        team1: { id: t1.id, name: t1.name, logoUrl: t1.logoUrl ?? null },
        team2: { id: t2.id, name: t2.name, logoUrl: t2.logoUrl ?? null },
        legs: [],
        winnerTeamId: null,
        aggregate: null,
        completed: false,
      };
      round.ties.set(key, tie);
    }

    const pen = raw.score?.penalty;
    tie.legs.push({
      matchId: m.id,
      startTime: m.startTime,
      status: m.status,
      homeTeamId: m.homeTeamId,
      homeScore: m.homeScore,
      awayTeamId: m.awayTeamId,
      awayScore: m.awayScore,
      penalty:
        pen?.home != null && pen?.away != null
          ? { home: pen.home, away: pen.away }
          : null,
    });

    // af 가 직접 알려주는 승자가 가장 정확하다 — 승부차기·원정 다득점까지 반영돼 있다
    if (tie.winnerTeamId === null) {
      if (raw.teams?.home?.winner === true) tie.winnerTeamId = m.homeTeamId;
      else if (raw.teams?.away?.winner === true) tie.winnerTeamId = m.awayTeamId;
    }
  }

  const rounds: CupRound[] = [];
  for (const [rank, r] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    const ties = [...r.ties.values()];
    for (const tie of ties) {
      tie.legs.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      // 홈앤어웨이 2차전은 길어야 몇 주 간격이다. 90일을 넘겨 떨어진 경기가 같은 tie 에
      // 묶였다면 다른 시즌의 같은 대진이라는 뜻 — 최근 묶음만 남긴다.
      if (tie.legs.length > 1) {
        const newest = tie.legs[tie.legs.length - 1].startTime.getTime();
        tie.legs = tie.legs.filter(
          (l) => newest - l.startTime.getTime() <= 90 * 24 * 3600 * 1000,
        );
      }
      tie.completed = tie.legs.every((l) => l.status === "FINISHED");

      if (tie.legs.length > 1) {
        let t1 = 0;
        let t2 = 0;
        for (const leg of tie.legs) {
          if (leg.homeScore == null || leg.awayScore == null) continue;
          if (leg.homeTeamId === tie.team1.id) {
            t1 += leg.homeScore;
            t2 += leg.awayScore;
          } else {
            t1 += leg.awayScore;
            t2 += leg.homeScore;
          }
        }
        tie.aggregate = { team1: t1, team2: t2 };
        if (tie.winnerTeamId === null && tie.completed && t1 !== t2) {
          tie.winnerTeamId = t1 > t2 ? tie.team1.id : tie.team2.id;
        }
      }
    }
    // 킥오프 순 — 같은 라운드 안에서 시간표 순서대로 읽힌다
    ties.sort(
      (a, b) =>
        (a.legs[0]?.startTime.getTime() ?? 0) - (b.legs[0]?.startTime.getTime() ?? 0),
    );
    rounds.push({ label: r.label, ko: roundKo(r.label), ties });
    void rank;
  }
  return rounds;
}
