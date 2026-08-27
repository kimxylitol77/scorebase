// 선수단 스냅샷(data/team-squads.json) 신선도 판정 — data-freshness 감시 축의 순수 판정부.
//
// 왜 필요한가. 이 파일은 맥미니 weekly-static-refresh(일요일)가 갱신하는데, 잡이 조용히
// 멈춰도 **내용은 멀쩡해서** 기존 감시 축이 하나도 안 울린다. 2026-08-27 실측 —
// 파일이 8/15 빌드로 12일 묵어 있는 동안 이적창이 열려 있었고, 실이적 82명이 팀 페이지
// 선수단에서 통째로 빠져 있었다(af 이적 섹션은 실시간이라 "영입은 떴는데 선수단엔 없음").
// 화면이 자기모순을 보여주는데 감시는 조용했다.
//
// 두 갈래로 본다. 원인이 달라 하나로는 못 잡는다.
//   · 전체 정체 — 가장 최근 updatedAt 이 낡음 = 빌더 자체가 안 돎.
//   · 일부 팀 정체 — 오래된 팀 비율 급증 = ts 가 빈 응답을 주거나 빌더 대상 집합에서 빠짐.
//     빌더는 병합식이라 갱신 실패 팀은 옛 값이 그대로 남는다. 소리 없이 낡는 유일한 경로다.

/** 빌더는 주 1회 — 한 번 걸러도 10일이면 확실히 멈춘 것이다. */
export const SQUAD_STALE_DAYS = 10;
/** 개별 팀이 이만큼 낡으면 "갱신 실패로 눌러앉은 것"으로 센다. */
export const SQUAD_TEAM_STALE_DAYS = 30;
/**
 * 눌러앉은 팀 비율 임계. 실측 2026-08-27 — 190팀 중 13팀(6.8%)이 빌더 대상 집합 밖이라
 * 항상 낡아 있다. 그 상시 잔량을 오탐으로 울리지 않게 20% 로 둔다.
 */
export const SQUAD_TEAM_STALE_PCT = 0.2;

export interface SquadEntry {
  updatedAt: string; // YYYY-MM-DD
}

export interface SquadFreshness {
  teams: number;
  newest: string | null;
  newestAgeDays: number | null;
  teamStale: number;
  /** 알림 사유 — 비어 있으면 정상. */
  problems: Array<{ kind: string; detail: string }>;
}

function ageDays(date: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

/** 스냅샷 신선도 판정. 파일이 비면 그 자체가 사고다. */
export function judgeSquadFreshness(
  entries: Record<string, SquadEntry>,
  now: Date,
): SquadFreshness {
  const dates = Object.values(entries).map((e) => e.updatedAt).filter(Boolean);
  const teams = dates.length;
  if (teams === 0) {
    return {
      teams: 0, newest: null, newestAgeDays: null, teamStale: 0,
      problems: [{ kind: "squad_snapshot_empty", detail: "선수단 스냅샷이 비었습니다 — build-team-squads 산출물 확인" }],
    };
  }
  const newest = dates.reduce((a, b) => (a > b ? a : b));
  const newestAgeDays = ageDays(newest, now);
  const teamStale = dates.filter((d) => ageDays(d, now) > SQUAD_TEAM_STALE_DAYS).length;

  const problems: Array<{ kind: string; detail: string }> = [];
  if (newestAgeDays > SQUAD_STALE_DAYS) {
    problems.push({
      kind: "squad_snapshot_stale",
      detail: `선수단 스냅샷이 ${newestAgeDays}일째 그대로입니다 (최신 ${newest}, 임계 ${SQUAD_STALE_DAYS}일). `
        + "weekly-static-refresh 가 도는지 확인 — 이적창이 열려 있으면 새 영입이 팀 페이지 선수단에서 통째로 빠집니다",
    });
  }
  if (teamStale / teams > SQUAD_TEAM_STALE_PCT) {
    problems.push({
      kind: "squad_team_stale",
      detail: `선수단이 ${SQUAD_TEAM_STALE_DAYS}일 넘게 안 바뀐 팀이 ${teamStale}/${teams}팀입니다 `
        + `(임계 ${SQUAD_TEAM_STALE_PCT * 100}%, 실측 상시 잔량 6.8%). ts 빈 응답이나 빌더 대상 집합 누락 확인`,
    });
  }
  return { teams, newest, newestAgeDays, teamStale, problems };
}
