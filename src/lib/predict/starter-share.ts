// "이 선수가 실질적으로 선발인가" 를 출전 기록으로 판정한다.
//
// **부상자 수를 세면 안 된다**(2026-08-03 사용자 지시). 후보가 다친 것과 에이스가 빠진 것을
//   같게 놓으면 안 되기 때문이다. 업계도 같은 방향이다 — Transfermarkt 기반 연구는 팀 전체
//   가치가 아니라 **그 경기 라인업의 가치**를 쓰고, 부상 영향은 결장 여부가 아니라 평소
//   출전 시간으로 가중한다.
//
// 왜 라인업이 아니라 시즌 누적인가. 우리 Match.lineupHome 은 선수 id 없이 이름 문자열만
//   갖고 있고 최근 180일 커버리지가 18%뿐이라 빅5 조차 성기다(2026-08-03 실측).
//   반면 player-season-stats 는 starts·minutes 를 4,367명(95%) 보유하고 빅5 가 촘촘하다.
//   실제 기용을 반영하므로 시장가치(잠재력·명성이 섞인다)보다 "주전인가"에 가깝다.
import seasonStats from "../../../data/player-season-stats.json";
import tsAfMap from "../../../data/ts-af-player-map.json";

interface SeasonStat {
  lg: string;
  season: string;
  team: string;
  pos: string | null;
  matches: number | null;
  starts: number | null;
  minutes: number | null;
}

const STATS = seasonStats as unknown as Record<string, SeasonStat>;
const TS_TO_AF = (tsAfMap as { tsToAf?: Record<string, number> }).tsToAf ?? {};

/**
 * af player id → ts player id (부상자는 af id 로 온다).
 *
 * ⚠️ 1:1 이 아니다 — af id 3,420개 중 131개에 ts id 가 둘 이상 붙어 있다(2026-08-03 실측).
 *   대개 같은 선수의 중복 레코드지만 값이 갈리는 것도 있다(af 736 → 95분 / 933분).
 *   그냥 덮어쓰면 마지막 것이 이겨 엉뚱한 출전 기록을 쓰게 되므로 **출전시간이 많은 쪽**을
 *   고른다. 적은 쪽은 중복·오매핑으로 생긴 껍데기일 가능성이 높다.
 */
const AF_TO_TS: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [ts, af] of Object.entries(TS_TO_AF)) {
    const prev = out[af];
    if (!prev) {
      out[af] = ts;
      continue;
    }
    if ((STATS[ts]?.minutes ?? -1) > (STATS[prev]?.minutes ?? -1)) out[af] = ts;
  }
  return out;
})();

/**
 * 팀별 출전시간 합과 선수 수 — share 의 분모. 같은 리그·시즌 안에서만 더한다.
 *
 * ⚠️ 선수 수가 적으면 분모가 그 선수 자신이 돼 share 가 100% 로 튄다(MLS 실측: 시즌스탯이
 *   92명뿐이라 팀당 1~2명 → 후보까지 "팀 전력의 100%" 로 잡혔다). 그런 값을 쌓으면 나중
 *   백테스트가 통째로 오염되므로 **표본이 얕으면 share 를 내지 않는다**.
 */
const MIN_SQUAD_FOR_SHARE = 10;

const TEAM_MINUTES: Map<string, { minutes: number; players: number }> = (() => {
  const m = new Map<string, { minutes: number; players: number }>();
  for (const s of Object.values(STATS)) {
    if (!s.minutes) continue;
    const k = `${s.lg}|${s.season}|${s.team}`;
    const cur = m.get(k) ?? { minutes: 0, players: 0 };
    cur.minutes += s.minutes;
    cur.players++;
    m.set(k, cur);
  }
  return m;
})();

export interface StarterShare {
  tsId: string;
  starts: number | null;
  matches: number | null;
  minutes: number | null;
  /** 팀 내 출전시간 비중 (0~1). 분모가 없으면 null */
  teamMinutesShare: number | null;
  team: string;
  league: string;
}

/**
 * 부상자(af id)의 주전도. 스탯이 없으면 null — **모르면 0 이 아니라 모른다고 둔다.**
 * 0 으로 채우면 "후보였다"로 오해돼 나중 백테스트가 오염된다.
 */
export function starterShareByAfId(afId: number): StarterShare | null {
  const tsId = AF_TO_TS[afId];
  if (!tsId) return null;
  const s = STATS[tsId];
  if (!s) return null;
  const denom = TEAM_MINUTES.get(`${s.lg}|${s.season}|${s.team}`);
  // 표본이 얕은 팀은 share 를 내지 않는다 — 100% 같은 헛값보다 "모른다"가 낫다
  const usable = denom != null && denom.players >= MIN_SQUAD_FOR_SHARE && denom.minutes > 0;
  return {
    tsId,
    starts: s.starts,
    matches: s.matches,
    minutes: s.minutes,
    teamMinutesShare: usable && s.minutes != null ? s.minutes / denom.minutes : null,
    team: s.team,
    league: s.lg,
  };
}

/**
 * 결장자 묶음이 팀 전력에서 차지하던 몫. 나중에 승률 조정의 입력이 될 값이다.
 * **지금은 저장·관찰만 하고 예측에 쓰지 않는다** — 백테스트를 통과해야 넣는다.
 */
export function absenceWeight(afIds: number[]): {
  totalShare: number;
  known: number;
  unknown: number;
} {
  let totalShare = 0;
  let known = 0;
  let unknown = 0;
  for (const id of afIds) {
    const s = starterShareByAfId(id);
    if (s?.teamMinutesShare == null) {
      unknown++;
      continue;
    }
    totalShare += s.teamMinutesShare;
    known++;
  }
  return { totalShare, known, unknown };
}
