// 날짜 미정 대진을 한 시각에 몰아 놓은 "자리표시자 묶음" 판정.
//
// 배경 (2026-08-28 UCL 실측). UEFA 리그페이즈 추첨은 8/27 에 끝났지만 실제 일정표는
// 8/29 에나 공개된다. 그 사이 TheSports 는 **대진만 확정된 144경기를 전부 같은 킥오프
// 시각(2026-09-08 19:00 UTC)에 얹어 둔다** — 36팀 × 8경기 ÷ 2 = 144, status_id 전부 1.
//
// 그대로 수집하면 /scores 에 UCL 144경기가 동시 킥오프로 뜬다. 일정이 배정되기 전까지는
// 날짜가 데이터가 아니라 자리표시자이므로, 들이지 않는 편이 맞다.
//
// 임계 근거. 평소 UCL 매치데이는 18경기가 이틀·두 시간대로 나뉘지만, **리그페이즈 마지막
// 라운드는 18경기가 한 시각에 동시 킥오프한다**(순위 공정성 — 2026-27 UCL 1/27·UEL 1/28·
// UECL 12/17 모두 18경기 동시). 처음엔 18 로 잡아 이 마지막 라운드가 통째로 버려졌다
// (2026-09-25 발견 — 워커 diary 도 같은 batch 로 보내 경기 당일에도 안 생겼을 것).
// 자리표시자는 실측 108~144 경기라, 한 라운드(18)의 두 배인 36 이면 둘을 가른다.
export const PLACEHOLDER_MIN_SAME_KICKOFF = 36;

/**
 * 같은 킥오프 시각에 몰린 경기 수가 임계를 넘는 시각들의 집합.
 * 호출부는 이 시각에 걸린 매치를 이번 수집에서 건너뛴다 — 일정이 배정되면 자연히 풀린다.
 */
export function placeholderKickoffTimes(
  matches: Array<{ startTime: Date }>,
  minSameKickoff: number = PLACEHOLDER_MIN_SAME_KICKOFF,
): Set<number> {
  const byTime = new Map<number, number>();
  for (const m of matches) {
    const t = m.startTime.getTime();
    byTime.set(t, (byTime.get(t) ?? 0) + 1);
  }
  const out = new Set<number>();
  for (const [t, n] of byTime) if (n >= minSameKickoff) out.add(t);
  return out;
}
