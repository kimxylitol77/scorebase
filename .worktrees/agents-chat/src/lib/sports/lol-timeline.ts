// LoL 게임 타임라인 — first_blood/dragon/baron/tower 등 오브젝트 이벤트 순서화.
// BDL team_match_map_stats 응답에 정확한 타임스탬프 없으므로 ordering heuristic 사용.

export type TimelineEventType =
  | "first_blood"
  | "first_dragon"
  | "first_herald"
  | "first_tower"
  | "first_baron"
  | "baron_kill"
  | "dragon_kill"
  | "herald_kill"
  | "game_end";

export interface TimelineEvent {
  type: TimelineEventType;
  team: "team1" | "team2";
  labelKo: string; // "퍼스트블러드", "1번 드래곤", "바론 처치" 등
  emoji: string;
  /** 추정 게임 시간(분). 정확한 timestamp 없으면 heuristic */
  estimatedMinute?: number;
  /** 정렬용 (시간 추정 어려운 경우 보조) */
  orderIdx: number;
}

const EMOJI: Record<TimelineEventType, string> = {
  first_blood: "🩸",
  first_dragon: "🐉",
  first_herald: "🦅",
  first_tower: "🏰",
  first_baron: "⚡",
  dragon_kill: "🐉",
  herald_kill: "🦅",
  baron_kill: "⚡",
  game_end: "🏆",
};

const LABEL: Record<TimelineEventType, string> = {
  first_blood: "퍼스트블러드",
  first_dragon: "1번 드래곤",
  first_herald: "1번 협곡의 전령",
  first_tower: "퍼스트 타워",
  first_baron: "1번 바론",
  dragon_kill: "추가 드래곤",
  herald_kill: "추가 협곡의 전령",
  baron_kill: "추가 바론",
  game_end: "게임 종료",
};

// 추정 분당 시점 (LCK 평균 데이터 기반 heuristic)
const ESTIMATED_MINUTE: Record<TimelineEventType, number> = {
  first_blood: 4,
  first_herald: 10,
  first_dragon: 8,
  first_tower: 12,
  first_baron: 22,
  dragon_kill: 18,
  herald_kill: 14,
  baron_kill: 28,
  game_end: 30,
};

export interface TeamObjectiveStat {
  /** 1 = 우리팀 가져감, 0 = 상대팀 */
  first_blood?: number;
  first_tower?: number;
  first_dragon?: number;
  first_baron?: number;
  dragon_kills?: number;
  baron_kills?: number;
  herald_kills?: number;
}

/**
 * 게임의 양 팀 통계로 이벤트 timeline 생성.
 * BDL 의 team_match_map_stats 의 first_* 필드는 boolean (또는 1/0).
 * dragon_kills, baron_kills, herald_kills 는 누적 수.
 */
export function buildGameTimeline(
  t1Stat: TeamObjectiveStat,
  t2Stat: TeamObjectiveStat,
  durationSec: number,
  winner: "team1" | "team2",
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let order = 0;
  const durationMin = durationSec > 0 ? durationSec / 60 : 30;

  function push(type: TimelineEventType, who: "team1" | "team2", estMin?: number) {
    events.push({
      type,
      team: who,
      labelKo: LABEL[type],
      emoji: EMOJI[type],
      estimatedMinute:
        estMin ?? Math.min(durationMin - 1, ESTIMATED_MINUTE[type]),
      orderIdx: order++,
    });
  }

  // 1) 퍼스트블러드
  if (t1Stat.first_blood) push("first_blood", "team1");
  else if (t2Stat.first_blood) push("first_blood", "team2");

  // 2) 1번 드래곤
  if (t1Stat.first_dragon) push("first_dragon", "team1");
  else if (t2Stat.first_dragon) push("first_dragon", "team2");

  // 3) 1번 협곡의 전령 (herald_kills > 0 면 첫 herald 추정)
  if (t1Stat.herald_kills && t1Stat.herald_kills > 0)
    push("first_herald", "team1");
  else if (t2Stat.herald_kills && t2Stat.herald_kills > 0)
    push("first_herald", "team2");

  // 4) 퍼스트 타워
  if (t1Stat.first_tower) push("first_tower", "team1");
  else if (t2Stat.first_tower) push("first_tower", "team2");

  // 5) 1번 바론
  if (t1Stat.first_baron) push("first_baron", "team1");
  else if (t2Stat.first_baron) push("first_baron", "team2");

  // 6) 추가 드래곤 (총 - 1 만큼)
  const dragT1 = (t1Stat.dragon_kills ?? 0) - (t1Stat.first_dragon ? 1 : 0);
  const dragT2 = (t2Stat.dragon_kills ?? 0) - (t2Stat.first_dragon ? 1 : 0);
  for (let i = 0; i < dragT1; i++)
    push("dragon_kill", "team1", ESTIMATED_MINUTE.dragon_kill + i * 3);
  for (let i = 0; i < dragT2; i++)
    push("dragon_kill", "team2", ESTIMATED_MINUTE.dragon_kill + i * 3);

  // 7) 추가 바론 (총 - 1)
  const baronT1 = (t1Stat.baron_kills ?? 0) - (t1Stat.first_baron ? 1 : 0);
  const baronT2 = (t2Stat.baron_kills ?? 0) - (t2Stat.first_baron ? 1 : 0);
  for (let i = 0; i < baronT1; i++)
    push("baron_kill", "team1", ESTIMATED_MINUTE.baron_kill + i * 5);
  for (let i = 0; i < baronT2; i++)
    push("baron_kill", "team2", ESTIMATED_MINUTE.baron_kill + i * 5);

  // 8) 게임 종료
  push("game_end", winner, durationMin);

  // 정렬 — estimatedMinute 우선
  events.sort(
    (a, b) =>
      (a.estimatedMinute ?? 999) - (b.estimatedMinute ?? 999) ||
      a.orderIdx - b.orderIdx,
  );
  return events;
}
