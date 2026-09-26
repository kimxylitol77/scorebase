// 주간 MVP 활동 히트맵 데이터 — 경기별 원시 터치(TheStatsAPI, data/player-match-heatmaps.json)를 주간 창으로 잘라
// 10×10 격자·3×3 존(3선×좌중우) 로 집계한다. 창 안 경기 좌표가 없으면 시즌 누적 셀로 폴백하고 source 로 알린다.
// 좌표 규약은 선수 페이지 HeatPitch 와 같다 — x 0~100 공격 방향 오른쪽, y 0~100 위→아래.
import rawMatch from "../../../data/player-match-heatmaps.json";
import rawSeason from "../../../data/player-heatmap-analysis.json";

interface MatchRow {
  id: string;
  date: string; // YYYY-MM-DD
  opp: string;
  ha: "H" | "A";
  score: string;
  result: "W" | "D" | "L";
  points: Array<[number, number]>;
}
interface SeasonRow {
  seasonLabel: string;
  matches: number;
  cells: { x: number; y: number; count: number }[]; // x·y 는 10 단위 하한(0~90)
}
const MATCH = rawMatch as unknown as Record<string, { seasonLabel: string; matches: MatchRow[] }>;
const SEASON = rawSeason as unknown as Record<string, SeasonRow>;

export interface MvpHeat {
  source: "match" | "season";
  /** 카드 부제 — "9/20 vs 맨체스터 시티 (A) 3:5" 또는 "2026-27 EPL 시즌 누적 N경기" */
  matches: Pick<MatchRow, "date" | "opp" | "ha" | "score" | "result">[];
  seasonLabel: string;
  seasonMatches: number;
  total: number;
  /** grid[xi][yi], xi·yi 0~9, 값은 가중 카운트 */
  grid: number[][];
  /** 가우시안 커널 밀도 — smooth[xi][yi], SMOOTH_X×SMOOTH_Y, 0~1 정규화(피크=1). 카드의 부드러운 열 표현용 */
  smooth: number[][];
  /** zones[third][lane] — third 0 수비·1 중원·2 공격, lane 0 왼쪽·1 중앙·2 오른쪽 */
  zones: number[][];
  avgX: number; // 0~100
  thirds: [number, number, number]; // % 수비·중원·공격
  lanes: [number, number, number]; // % 좌·중·우
}

export const SMOOTH_X = 32;
export const SMOOTH_Y = 20;

/** 선수 페이지 HeatPitch 의 KDE+블러를 서버에서 격자로 근사 — sigma 는 피치 % 단위 */
function kde(pts: Array<[number, number, number]>, sigma: number): number[][] {
  const out = Array.from({ length: SMOOTH_X }, () => Array(SMOOTH_Y).fill(0) as number[]);
  const inv = 1 / (2 * sigma * sigma);
  let peak = 0;
  for (let xi = 0; xi < SMOOTH_X; xi++) {
    const cx = ((xi + 0.5) / SMOOTH_X) * 100;
    for (let yi = 0; yi < SMOOTH_Y; yi++) {
      const cy = ((yi + 0.5) / SMOOTH_Y) * 100;
      let v = 0;
      for (const [x, y, w] of pts) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > sigma * sigma * 9) continue;
        v += w * Math.exp(-d2 * inv);
      }
      out[xi][yi] = v;
      if (v > peak) peak = v;
    }
  }
  if (peak > 0) for (const col of out) for (let i = 0; i < col.length; i++) col[i] /= peak;
  return out;
}

const inWindow = (date: string, from: string, to: string) => {
  // 공급자 날짜는 현지/UTC 기준이라 KST 창보다 하루 빠를 수 있다 — 앞쪽 하루 여유
  const lo = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  return date >= lo && date <= to;
};

function aggregate(pts: Array<[number, number, number]>, sigma: number): Omit<MvpHeat, "source" | "matches" | "seasonLabel" | "seasonMatches"> {
  const grid = Array.from({ length: 10 }, () => Array(10).fill(0) as number[]);
  const zones = Array.from({ length: 3 }, () => Array(3).fill(0) as number[]);
  let total = 0;
  let sx = 0;
  for (const [x, y, w] of pts) {
    const xi = Math.min(9, Math.max(0, Math.floor(x / 10)));
    const yi = Math.min(9, Math.max(0, Math.floor(y / 10)));
    grid[xi][yi] += w;
    zones[Math.min(2, Math.floor(x / (100 / 3)))][Math.min(2, Math.floor(y / (100 / 3)))] += w;
    total += w;
    sx += x * w;
  }
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);
  const third = (i: number) => zones[i].reduce((a, b) => a + b, 0);
  const lane = (i: number) => zones.reduce((a, z) => a + z[i], 0);
  return {
    total: Math.round(total),
    grid,
    smooth: kde(pts, sigma),
    zones,
    avgX: total ? sx / total : 0,
    thirds: [pct(third(0)), pct(third(1)), pct(third(2))],
    lanes: [pct(lane(0)), pct(lane(1)), pct(lane(2))],
  };
}

/** 창 안 경기 좌표 우선, 없으면 시즌 누적. 둘 다 없으면 null. */
export function getMvpHeat(playerId: string, from: string, to: string): MvpHeat | null {
  const m = MATCH[playerId];
  const week = (m?.matches ?? []).filter((r) => inWindow(r.date, from, to) && r.points.length > 0);
  if (week.length > 0) {
    // [99,99] 는 공급자 sentinel(전체의 0.3%) — 코너에 뭉치므로 제외
    const pts = week.flatMap((r) => r.points.filter(([x, y]) => !(x >= 99 && y >= 99)).map(([x, y]) => [x, y, 1] as [number, number, number]));
    const s = SEASON[playerId];
    return {
      source: "match",
      matches: week.sort((a, b) => a.date.localeCompare(b.date)).map(({ date, opp, ha, score, result }) => ({ date, opp, ha, score, result })),
      seasonLabel: m.seasonLabel,
      seasonMatches: s?.matches ?? 0,
      ...aggregate(pts, 6),
    };
  }
  const s = SEASON[playerId];
  if (!s || s.cells.length === 0) return null;
  // 셀 하한 좌표 → 셀 중심(+5)으로 집계해야 3선·좌중우 경계가 어긋나지 않는다
  const pts = s.cells.map((c) => [c.x + 5, c.y + 5, c.count] as [number, number, number]);
  // 셀 단위(10%) 입력이라 커널을 넓혀 격자 주기를 뭉갠다
  return { source: "season", matches: [], seasonLabel: s.seasonLabel, seasonMatches: s.matches, ...aggregate(pts, 8) };
}

export const hasMvpHeat = (playerId: string, from: string, to: string) => getMvpHeat(playerId, from, to) != null;
