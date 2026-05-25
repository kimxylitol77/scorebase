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

// 확정된 stat_id 만 라벨링. 미확정은 표시 안 함 (라벨 "?" 도 정보 가치 낮음).
// 추가 검증 후 점진 확장.
const TEAM_STAT_LABEL: Record<number, { label: string; decimal: boolean }> = {
  601: { label: "안타 (H)", decimal: false },
  611: { label: "타석 (AB)", decimal: false },
  612: { label: "타율 (AVG)", decimal: true },
  // 추정 — 다른 stat_id 매핑 확정 시 여기 추가.
  // 602: HR, 605: E, 608: BB, 609: SO 가능성 — 별도 검증 후 라벨.
};

const TEAM_STAT_ORDER = [611, 601, 612];

/**
 * detail_live.stats (array of [phase, [[stat_id, away, home], ...]]) 에서
 * phase 0 의 라벨링된 행만 추출.
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
    const [id, away, home] = row;
    if (typeof id === "number") {
      rowsById.set(id, [Number(away), Number(home)]);
    }
  }
  const out: TeamStatRow[] = [];
  for (const id of TEAM_STAT_ORDER) {
    const v = rowsById.get(id);
    const meta = TEAM_STAT_LABEL[id];
    if (!v || !meta) continue;
    out.push({ statId: id, label: meta.label, away: v[0], home: v[1], decimal: meta.decimal });
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
