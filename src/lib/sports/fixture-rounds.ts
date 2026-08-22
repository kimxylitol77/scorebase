// 축구 일정 탭 보조 — Match.raw 에서 라운드(matchweek) 추출 + 크로스소스 중복 매치 판정.
// 라운드 컬럼이 스키마에 없어 raw 원본에서 읽는다. 두 소스 형태가 다르다.
//   api-football : {"league":{"round":"Regular Season - 12"}}
//   football-data: {"matchday":12}
//   thesports    : {"thesports":{"round":{"roundNum":12,"stageName":"Round 1"}}} — 리그는 roundNum,
//                  컵은 roundNum=0 이라 일정 탭 라운드 네비엔 못 쓰고 대진표(cup-bracket)가 stageName 을 읽는다.
// 중복은 DB 정리(cleanup-duplicate-matches)가 미래 SCHEDULED 를 보류하는 사이
// 화면에 카드가 두 장 뜨는 것을 막기 위한 표시층 방어. DB 는 건드리지 않는다.

/** 같은 대진이 이 시간 안에 두 번 있으면 중복으로 본다 (라운드 미상일 때만 사용). */
const DUP_WINDOW_MS = 72 * 3600_000;

/** af "Regular Season - 12" / "Group Stage - 3" · fd matchday → 12. 못 읽으면 null. */
export function parseRound(raw: string | null): number | null {
  if (!raw) return null;
  const ts = raw.match(/"roundNum"\s*:\s*(\d+)/);
  if (ts) {
    const n = Number(ts[1]);
    return n > 0 ? n : null;
  }
  // af — round 문자열 끝의 숫자. "Round of 16" 처럼 녹아웃 라벨은 숫자가 없거나
  // 의미가 달라 Regular/Group/Round N 형태만 취한다.
  const af = raw.match(/"round"\s*:\s*"([^"]+)"/);
  if (af) {
    const label = af[1];
    if (/regular season|group stage|matchday|round\s*\d/i.test(label)) {
      const n = label.match(/(\d+)\s*$/);
      if (n) return Number(n[1]);
    }
    return null;
  }
  const fd = raw.match(/"matchday"\s*:\s*(\d+)/);
  if (fd) return Number(fd[1]);
  return null;
}

interface DedupeInput {
  id: number;
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamId: number;
  awayTeamId: number;
  round: number | null;
  /** api-football 원본이면 true — 새 시즌 전체 일정을 싣는 쪽이라 keeper 로 우선한다. */
  isApiFootball: boolean;
}

/**
 * keeper 우선순위 — 종료/진행 > 스코어 보유 > **라운드 보유** > af 원본 > 먼저 생성된 row.
 * 라운드 보유를 앞에 두는 이유: 같은 경기를 두 소스가 실었을 때 한쪽 raw 에만 라운드가 있고,
 * 라운드 없는 쪽이 이기면 그 라운드가 목록에서 통째로 사라진다
 * (실측 2026-07-29 — 라리가 1~7R·분데스 2~4R 이 이 경로로 증발했다).
 */
function better<T extends DedupeInput>(a: T, b: T): T {
  const rank = (m: T) => (m.status === "FINISHED" ? 2 : m.status === "LIVE" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  // 스코어는 끝났거나 진행 중일 때만 근거로 삼는다 — 일부 소스(ESPN)는 시작 전 경기를
  // 0-0 으로 채워 보내서, 그냥 null 검사만 하면 예정 경기가 "스코어 보유"로 이겨버린다.
  const scored = (m: T) =>
    (m.status === "FINISHED" || m.status === "LIVE") && (m.homeScore != null || m.awayScore != null)
      ? 1
      : 0;
  if (scored(a) !== scored(b)) return scored(a) > scored(b) ? a : b;
  const hasRound = (m: T) => (m.round != null ? 1 : 0);
  if (hasRound(a) !== hasRound(b)) return hasRound(a) > hasRound(b) ? a : b;
  if (a.isApiFootball !== b.isApiFootball) return a.isApiFootball ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * 같은 실제 경기를 가리키는 row 를 하나로 접는다.
 * 판정 = 같은 홈/원정 팀쌍 + (같은 라운드 | 킥오프 72시간 이내).
 * 리그전에서 같은 홈팀-원정팀 조합이 사흘 안에 두 번 열리는 일은 없어 오탐 위험이 낮다.
 */
export function dedupeFixtures<T extends DedupeInput>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const m of rows) {
    const key = `${m.homeTeamId}-${m.awayTeamId}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }
  const kept: T[] = [];
  for (const bucket of groups.values()) {
    if (bucket.length === 1) {
      kept.push(bucket[0]);
      continue;
    }
    // 같은 팀쌍 안에서 라운드/시간이 겹치는 것끼리만 접는다 (컵 재경기 보호).
    const clusters: T[][] = [];
    for (const m of bucket.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())) {
      const hit = clusters.find((c) =>
        c.some((x) =>
          m.round != null && x.round != null
            ? m.round === x.round
            : Math.abs(x.startTime.getTime() - m.startTime.getTime()) <= DUP_WINDOW_MS,
        ),
      );
      if (hit) hit.push(m);
      else clusters.push([m]);
    }
    for (const c of clusters) kept.push(c.reduce(better));
  }
  return kept.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

/**
 * 라운드 네비게이션을 켤지 판정 — 라운드를 읽은 경기가 8할 넘고 라운드가 둘 이상일 때만.
 * MLS(라운드 정보 없음)·녹아웃 대회는 기존 날짜 목록으로 남는다.
 */
export function hasUsableRounds(rows: { round: number | null }[]): boolean {
  if (rows.length === 0) return false;
  const withRound = rows.filter((r) => r.round != null);
  if (withRound.length / rows.length < 0.8) return false;
  return new Set(withRound.map((r) => r.round)).size >= 2;
}
