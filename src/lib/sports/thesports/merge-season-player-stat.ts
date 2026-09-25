// ts 시즌 선수통계의 (선수×팀) 행을 선수 단위로 합치는 순수 함수 — 리더보드 집계용.
//
// season/recent/player/stat 은 시즌 중 이적한 선수를 팀마다 한 행씩 준다(2026-09-25 실측:
// 아르헨티나 1부 1174명 중 81명, 에스토니아 335명 중 44명). 행 단위로 순위를 매기면
// 기록이 팀별로 쪼개져 순위가 낮게 나오고, 두 행이 모두 상위권이면 같은 선수가 두 번
// 오른다(LATVIA_VL 득점). 팀 표시는 현재 소속 = updated_at 이 가장 늦은 행의 팀.
import type { TSFootballSeasonPlayerStatResponse } from "./football-types";

export type TsSeasonPlayerStatRow = TSFootballSeasonPlayerStatResponse["results"][number];

export function mergeSeasonPlayerStatRows(rows: TsSeasonPlayerStatRow[]): TsSeasonPlayerStatRow[] {
  const byPlayer = new Map<string, TsSeasonPlayerStatRow[]>();
  const out: TsSeasonPlayerStatRow[] = [];
  for (const r of rows) {
    const id = r.player?.id;
    if (!id) {
      out.push(r); // 선수 id 없는 행은 합칠 기준이 없다 — 그대로 둔다
      continue;
    }
    const g = byPlayer.get(id);
    if (g) g.push(r);
    else byPlayer.set(id, [r]);
  }
  for (const group of byPlayer.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const latest = group.reduce((a, b) => ((b.updated_at ?? 0) > (a.updated_at ?? 0) ? b : a));
    const merged: Record<string, unknown> = { ...latest };
    // 누적 스탯은 전부 합산 — rating 도 x100 누적값이라 합산 후 court 로 나누면 시즌 평균이 된다.
    for (const r of group) {
      if (r === latest) continue;
      for (const [k, v] of Object.entries(r)) {
        if (k === "updated_at" || typeof v !== "number") continue;
        merged[k] = ((merged[k] as number | undefined) ?? 0) + v;
      }
    }
    out.push(merged as TsSeasonPlayerStatRow);
  }
  return out;
}
