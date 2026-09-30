// 포스트시즌 선수 기록 → 리그 페이지 통계 탭 리더보드 행(타율·홈런·타점·ERA·승·탈삼진). 정규시즌 리더보드와 같은 모양.
// 규정은 /baseball/postseason/stats 와 같다 — 타율은 최다 출장의 절반 이상, ERA 는 최다 이닝의 4분의 1 이상(minIp).
import type { LeaderRow } from "@/components/LeagueLeaderBoard";
import type { BbPlayerRow } from "./player-rankings";

export interface PostseasonInput {
  bat: BbPlayerRow[];
  pit: BbPlayerRow[];
  minIp: number;
}

const TOP = 10;

export function postseasonLeaderRows(
  ps: PostseasonInput,
  photoOf: (r: BbPlayerRow) => string | null,
  idOf: (r: BbPlayerRow) => string | null,
): Record<string, LeaderRow[]> {
  const maxGames = ps.bat.reduce((m, r) => Math.max(m, r.games), 0);
  const minGames = Math.max(1, Math.ceil(maxGames * 0.5));
  const toRow = (r: BbPlayerRow, i: number, value: number, sub: string | null): LeaderRow => ({
    rank: i + 1,
    playerName: r.name,
    playerNameEn: r.nameEn,
    teamName: r.team,
    teamShort: null,
    value,
    unit: null,
    appearances: r.games,
    subLabel: sub,
    photoUrl: photoOf(r),
    externalId: idOf(r),
  });
  // 같은 값이면 출장·이닝이 많은 쪽 먼저 — 표본이 큰 기록을 위로
  const pick = (
    rows: BbPlayerRow[],
    val: (r: BbPlayerRow) => number | null,
    dir: "desc" | "asc",
    tie: (r: BbPlayerRow) => number,
    sub: (r: BbPlayerRow) => string | null,
  ): LeaderRow[] =>
    rows
      .filter((r) => val(r) != null)
      .sort((a, b) => (dir === "desc" ? val(b)! - val(a)! : val(a)! - val(b)!) || tie(b) - tie(a))
      .slice(0, TOP)
      .map((r, i) => toRow(r, i, val(r)!, sub(r)));

  const qualBat = ps.bat.filter((r) => r.games >= minGames);
  const qualPit = ps.pit.filter((r) => (r.ip ?? 0) >= ps.minIp);
  const out: Record<string, LeaderRow[]> = {
    BA: pick(qualBat, (r) => r.avg, "desc", (r) => r.games, (r) => (r.hits != null ? `${r.hits}안타` : null)),
    HR: pick(ps.bat.filter((r) => (r.hr ?? 0) > 0), (r) => r.hr, "desc", (r) => -r.games, () => null),
    RBI: pick(ps.bat.filter((r) => (r.rbi ?? 0) > 0), (r) => r.rbi, "desc", (r) => -r.games, () => null),
    ERA: pick(qualPit, (r) => r.era, "asc", (r) => r.ip ?? 0, (r) => (r.ip != null ? `${Math.round(r.ip * 10) / 10}이닝` : null)),
    WIN: pick(ps.pit.filter((r) => (r.w ?? 0) > 0), (r) => r.w, "desc", (r) => -(r.ip ?? 0), (r) => `${r.w}승 ${r.l ?? 0}패`),
    K: pick(ps.pit.filter((r) => (r.so ?? 0) > 0), (r) => r.so, "desc", (r) => -(r.ip ?? 0), (r) => (r.ip != null ? `${Math.round(r.ip * 10) / 10}이닝` : null)),
  };
  for (const k of Object.keys(out)) if (out[k].length === 0) delete out[k];
  return out;
}
