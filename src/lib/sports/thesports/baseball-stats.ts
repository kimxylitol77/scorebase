// TheSports baseball stat_id 매핑 + 박스스코어/팀 stats 추출 헬퍼.
// 매핑은 production cache (KBO/NPB/MLB 합 100+ 매치) 의 값 분포 + 검증된 KBO
// 매치 결과 비교로 도출. 확정 안 된 id 는 라벨 없이 hide.

// TEAM stats — phase 0 (전체) 의 [stat_id, away, home] 튜플.
export interface TeamStatRow {
  statId: number;
  label: string;
  away: number;
  home: number;
  /** true 면 소수 (타율 등) → 소수점 3자리, false 면 정수. */
  decimal: boolean;
}

// stat_id 매핑은 2026-05-25 KBO/NPB/MLB 28 매치 cache 와 statsapi.mlb.com
// boxscore cross-check 로 확정.
//   601 = H (안타) — cache vs API hits 13/17 match (나머지는 cache stale)
//   602 = E (실책) — fielding errors 14/17 match
//   603 = 2B (2루타) — MLB only, 13/17 match
//   604 = 3B (3루타) — MLB only, 16/17 match
//   605 = HR (홈런) — 13/17 match
//   606 = RBI (타점) — 13/17 match (R 와 종종 1점 차이로 구분됨)
//   608 = BB (볼넷) — 13/17 match
//   609 = SO (삼진) — 13/17 match
//   610 = SB (도루) — 14/17 match
//   611 = AB (타석) — 13/17 match
//   612 = AVG (타율) — 28/28 H/AB 산식 일치
// 607 만 미확정 (단일 stat candidate 매칭 0/17). 라벨 제외.
const TEAM_STAT_LABEL: Record<number, { label: string; decimal: boolean }> = {
  601: { label: "안타 (H)", decimal: false },
  602: { label: "실책 (E)", decimal: false },
  603: { label: "2루타", decimal: false },
  604: { label: "3루타", decimal: false },
  605: { label: "홈런 (HR)", decimal: false },
  606: { label: "타점 (RBI)", decimal: false },
  608: { label: "볼넷 (BB)", decimal: false },
  609: { label: "삼진 (SO)", decimal: false },
  610: { label: "도루 (SB)", decimal: false },
  611: { label: "타석 (AB)", decimal: false },
  612: { label: "타율 (AVG)", decimal: true },
};

// 박스스코어 일반 순서 (KBO/네이버 스타일): AB, H, HR, RBI, BB, SO, SB, 2B, 3B, E, AVG
const TEAM_STAT_ORDER = [611, 601, 605, 606, 608, 609, 610, 603, 604, 602, 612];

/**
 * detail_live.stats (array of [phase, [[stat_id, home, away], ...]]) 에서
 * phase 0 의 라벨링된 행만 추출.
 *
 * row 순서 = [stat_id, home, away] (2026-05-25 statsapi.mlb.com boxscore 와
 * 17 MLB 매치 cross-check 로 확정. row[1] = home, row[2] = away).
 */
export function extractTeamStats(stats: unknown): TeamStatRow[] {
  if (!Array.isArray(stats)) return [];
  const phase0 = stats.find(
    (s) => Array.isArray(s) && s[0] === 0 && Array.isArray(s[1]),
  );
  if (!phase0) return [];
  const rowsById = new Map<number, [number, number]>();
  for (const row of phase0[1] as unknown[]) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [id, home, away] = row;
    if (typeof id === "number") {
      rowsById.set(id, [Number(home), Number(away)]);
    }
  }
  const out: TeamStatRow[] = [];
  for (const id of TEAM_STAT_ORDER) {
    const v = rowsById.get(id);
    const meta = TEAM_STAT_LABEL[id];
    if (!v || !meta) continue;
    out.push({ statId: id, label: meta.label, home: v[0], away: v[1], decimal: meta.decimal });
  }
  return out;
}

// PLAYER stats — detail_live.players.{home,away}: [{ id, stats: [[stat_id, val], ...] }]
const PLAYER_STAT_LABEL: Record<number, { label: string; decimal: boolean; type: "batter" | "pitcher" | "both" }> = {
  // 타자 stats (613~633 중 가장 흔한 것만 일단 라벨링).
  // 자주 0 인 stat_id 는 표시 가치 낮음 → hide. 큰 값 stat_id 우선.
  613: { label: "AB", decimal: false, type: "batter" }, // avg 3.87 — at-bats
  614: { label: "PA", decimal: false, type: "batter" }, // avg 3.11 — plate appearances 추정
  // 투수 stats
  634: { label: "IP", decimal: true, type: "pitcher" }, // decimal max 8 — innings pitched
  640: { label: "P", decimal: false, type: "pitcher" }, // max 106 — pitch count
};

export interface PlayerStatRow {
  playerId: string;
  /** 타자/투수 분류 — pitcher stat (634 등) 있으면 pitcher. */
  role: "batter" | "pitcher";
  stats: Record<number, number>; // 모든 stat_id 보존 (라벨링 안 된 것도 포함)
}

interface RawPlayer {
  id?: string;
  stats?: Array<[number, number]>;
}

/**
 * detail_live.players → home/away 별 PlayerStatRow[].
 */
export function extractPlayerStats(
  players: unknown,
): { home: PlayerStatRow[]; away: PlayerStatRow[] } {
  const out = { home: [] as PlayerStatRow[], away: [] as PlayerStatRow[] };
  if (!players || typeof players !== "object") return out;
  for (const side of ["home", "away"] as const) {
    const arr = (players as Record<string, unknown>)[side];
    if (!Array.isArray(arr)) continue;
    for (const raw of arr as RawPlayer[]) {
      if (!raw?.id || !Array.isArray(raw.stats)) continue;
      const map: Record<number, number> = {};
      let isPitcher = false;
      for (const tuple of raw.stats) {
        if (!Array.isArray(tuple) || tuple.length < 2) continue;
        const [id, v] = tuple;
        if (typeof id !== "number") continue;
        map[id] = Number(v);
        // 634 (IP) 또는 640 (pitch count) 있으면 투수로 분류
        if ((id === 634 || id === 640) && Number(v) > 0) isPitcher = true;
      }
      out[side].push({
        playerId: String(raw.id),
        role: isPitcher ? "pitcher" : "batter",
        stats: map,
      });
    }
  }
  return out;
}

export interface PlayerStatLabel {
  statId: number;
  label: string;
  decimal: boolean;
}

/**
 * 박스스코어 카드용 — role 별 라벨링된 stat 컬럼 정의 반환.
 */
export function playerStatColumns(role: "batter" | "pitcher"): PlayerStatLabel[] {
  const out: PlayerStatLabel[] = [];
  for (const [idStr, meta] of Object.entries(PLAYER_STAT_LABEL)) {
    if (meta.type === role || meta.type === "both") {
      out.push({ statId: parseInt(idStr, 10), label: meta.label, decimal: meta.decimal });
    }
  }
  return out;
}
