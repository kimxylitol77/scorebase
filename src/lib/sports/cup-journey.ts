// 녹아웃 컵 "대회 여정" 규칙 — 라운드 이름 읽기·한글 표기·단계 정리·디펜딩 챔피언 판정.
// prisma 없음(테스트용). 데이터 조회·화면은 components/leagues/cup-journey.
import { roundKo } from "@/lib/predict/cup-bracket";

/**
 * 경기 raw 에서 라운드 이름. 소스별로 자리가 다르다.
 *  - api-football: {"league":{"round":"Round of 16"}}
 *  - ts 워커 경로: {"thesports":{"round":{"stageName":"Round 1"}}}
 *  - ts 수집기 경로: ts 경기 객체 그대로 {"round":{"stage_id":…,"stageName":…}}
 */
export function stageLabelFromRaw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as {
      league?: { round?: string };
      thesports?: { round?: { stageName?: string | null } };
      round?: { stageName?: string | null };
    };
    const label = j.league?.round ?? j.thesports?.round?.stageName ?? j.round?.stageName ?? null;
    return label && label.trim() ? label.trim() : null;
  } catch {
    return null;
  }
}

const ORD: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

/**
 * 라운드 이름 한글화 — 소스가 붙인 이름을 그대로 옮긴다(공식 체계에 끼워 맞추지 않는다).
 * ts 는 FA컵 예선을 "Second Preliminary Round"·"First Round Qualifying"처럼 부른다.
 */
export function stageKo(label: string): string {
  const s = label.trim().toLowerCase();
  if (/^extra preliminary round$/.test(s)) return "추가 예비라운드";
  const prelim = s.match(/^(first|second|third|fourth) preliminary round$/);
  if (prelim) return `${ORD[prelim[1]]}차 예비라운드`;
  if (/^preliminary round$/.test(s)) return "예비라운드";
  const qual = s.match(/^(first|second|third|fourth) round qualifying$/);
  if (qual) return `예선 ${ORD[qual[1]]}라운드`;
  const proper = s.match(/^(first|second|third|fourth|fifth|sixth) round proper$/);
  if (proper) return `본선 ${ORD[proper[1]]}라운드`;
  // "1/8 finals" = 16강. "final" 이 들어갔다고 결승으로 옮기면 틀린다(코파 두 브라질 16강이 "결승 16경기"로 나왔다).
  const frac = s.match(/^1\/(\d+)[\s-]*finals?$/);
  if (frac) return `${Number(frac[1]) * 2}강`;
  if (/^group stage$|^group [a-z]$/.test(s)) return "조별리그";
  return roundKo(label);
}

export interface JourneyMatchLite {
  stage: string;
  status: string;
  startTime: Date;
}
export interface JourneyStage {
  label: string;
  ko: string;
  total: number;
  finished: number;
  scheduled: number;
  first: Date;
  last: Date;
}

/** 라운드를 첫 경기 날짜 순으로 — 라벨 순서표 없이 데이터가 말하는 순서를 쓴다. */
export function buildStages(matches: JourneyMatchLite[]): JourneyStage[] {
  const by = new Map<string, JourneyStage>();
  for (const m of matches) {
    const s = by.get(m.stage) ?? {
      label: m.stage, ko: stageKo(m.stage), total: 0, finished: 0, scheduled: 0, first: m.startTime, last: m.startTime,
    };
    s.total++;
    if (m.status === "FINISHED") s.finished++;
    if (m.status === "SCHEDULED" || m.status === "LIVE") s.scheduled++;
    if (m.startTime < s.first) s.first = m.startTime;
    if (m.startTime > s.last) s.last = m.startTime;
    by.set(m.stage, s);
  }
  return [...by.values()].sort((a, b) => a.first.getTime() - b.first.getTime());
}

/** 지금 단계 — 경기가 끝났거나 진행 중인 가장 늦은 라운드. 아직 한 경기도 안 치렀으면 null. */
export function currentStage(stages: JourneyStage[]): JourneyStage | null {
  const played = stages.filter((s) => s.finished > 0 || s.scheduled < s.total);
  return played.length ? played[played.length - 1] : null;
}

/** 시즌 라벨 — 가을 개막 컵은 "2026-27", 달력 시즌 컵은 "2026". 기록 형식을 따라간다. */
export function seasonLabel(firstMatch: Date, calendarYear: boolean): string {
  const y = firstMatch.getUTCFullYear();
  if (calendarYear) return String(y);
  const start = firstMatch.getUTCMonth() >= 6 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** 직전 시즌 라벨 — "2026-27" → "2025-26", "2026" → "2025". */
export function previousSeason(label: string): string {
  const cross = label.match(/^(\d{4})-(\d{2})$/);
  if (cross) {
    const s = Number(cross[1]) - 1;
    return `${s}-${String((s + 1) % 100).padStart(2, "0")}`;
  }
  return String(Number(label) - 1);
}

/**
 * 우승 기록 카드 문구. 직전 시즌 기록이면 "디펜딩 챔피언", 더 오래됐으면 연도를 붙인 "기록상 최근 우승".
 * (코파 두 브라질은 기록이 2020년에 멈춰 있다 — 그걸 디펜딩 챔피언이라 부르면 틀린다.)
 */
export function championFact(
  record: { season: string; ko: string } | null | undefined,
  current: string,
): { label: string; main: string; sub: string } | null {
  if (!record) return null;
  // 끝난 시즌을 보고 있으면 기록이 곧 그 시즌 우승팀이다.
  const thisSeason = record.season === current;
  const defending = record.season === previousSeason(current);
  return {
    label: thisSeason ? "우승" : defending ? "디펜딩 챔피언" : "기록상 최근 우승",
    main: record.ko,
    sub: `${record.season} 우승`,
  };
}

/** 이 기간 넘게 새 경기가 없고 예정 경기도 없으면 "진행 중"이라 부르지 않는다(컵 라운드 간격은 길어야 5주 남짓). */
export const STALE_DAYS = 60;

/**
 * 수집이 끊긴 시즌인가 — 마지막 경기가 오래됐고 예정 경기가 없고 결승도 안 끝났으면 그렇다.
 * 스위스컵은 2025-26 1라운드(64강)만 있어 "64강까지 진행"이 지금 진행 중처럼 읽혔다(2026-09-24).
 * @param now 판정 기준 시각(렌더 시각) — 테스트에서 고정한다
 */
export function isStaleSeason(stages: JourneyStage[], finalDone: boolean, now: Date): boolean {
  if (finalDone || stages.length === 0) return false;
  if (stages.some((s) => s.scheduled > 0)) return false;
  const last = Math.max(...stages.map((s) => s.last.getTime()));
  return now.getTime() - last > STALE_DAYS * 86400_000;
}

/**
 * 단판 결승이 끝났으면 그 결과로 우승팀 — 기록 파일보다 DB 결과가 정본이다(결과 문구는 DB 판정).
 * 2경기 이상(홈앤어웨이 결승)이거나 무승부인데 승부차기가 없으면 판정하지 않는다.
 */
export function finalWinner(
  finals: Array<{ status: string; homeScore: number | null; awayScore: number | null; home: string; away: string; pk: { home: number; away: number } | null }>,
): string | null {
  if (finals.length !== 1) return null;
  const f = finals[0];
  if (f.status !== "FINISHED" || f.homeScore == null || f.awayScore == null) return null;
  if (f.homeScore !== f.awayScore) return f.homeScore > f.awayScore ? f.home : f.away;
  if (f.pk && f.pk.home !== f.pk.away) return f.pk.home > f.pk.away ? f.home : f.away;
  return null;
}

/** 결승 라벨인가 — "Final"·"The Final". 준결승·8강·3위전은 아니다. */
export function isFinalLabel(label: string): boolean {
  return /^(the )?final$/i.test(label.trim());
}

/** 시즌 사이 공백으로 볼 최소 일수 — 컵 겨울 휴식은 길어야 60일 남짓(스위스컵 16강→8강 61일, DFB 포칼 63일),
 *  시즌 사이 여름 공백은 이보다 길다(스위스컵 2025-26 4강 → 2026-27 64강 117일). */
export const SEASON_GAP_DAYS = 90;

/**
 * 이번 시즌 경기만 — 두 경계 중 늦은 쪽부터.
 *  1) 직전 결승 다음 경기(결승이 데이터 끝이면 그 앞 시즌 결승 다음)
 *  2) 마지막으로 90일 넘게 비었던 곳 다음 경기 — 결승이 수집되지 않은 시즌용
 *     (스위스컵 2025-26 은 4강까지만 있어 1)로는 못 가르고 2026-27 64강과 한 시즌으로 섞였다)
 * 날짜 창만으로 자르면 두 시즌이 섞인다(최신 경기 기준 300일 창).
 * @param matches 시작 시각 오름차순
 */
export function currentSeasonMatches<T extends { stage: string; startTime: Date }>(matches: T[]): T[] {
  if (matches.length === 0) return [];
  let from = 0;

  const finals: number[] = [];
  matches.forEach((m, i) => isFinalLabel(m.stage) && finals.push(i));
  if (finals.length > 0) {
    const lastFinal = finals[finals.length - 1];
    const lastFinalDay = matches[lastFinal].startTime.getTime();
    if (lastFinal < matches.length - 1) {
      // 마지막 결승 뒤에 새 라운드가 있으면 그게 이번 시즌. (홈앤어웨이 결승 2차전은 같은 결승 라벨)
      from = lastFinal + 1;
    } else {
      // 결승이 끝이면 방금 끝난 시즌 — 그보다 60일 넘게 앞선 다른 시즌 결승을 경계로.
      const prev = finals.filter((i) => matches[i].startTime.getTime() < lastFinalDay - 60 * 86400_000);
      if (prev.length) from = prev[prev.length - 1] + 1;
    }
  }
  for (let i = matches.length - 1; i > from; i--) {
    if (matches[i].startTime.getTime() - matches[i - 1].startTime.getTime() > SEASON_GAP_DAYS * 86400_000) {
      from = i;
      break;
    }
  }
  return matches.slice(from);
}
