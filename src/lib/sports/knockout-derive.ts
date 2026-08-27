// 조별리그→녹아웃 대회의 토너먼트 라운드를 매치 위상으로 유도한다 (8강·준결승·3위전·결승).
//
// 왜 유도인가. ts 배구 diary 에는 라운드 정보가 없다 — stage_id 필드 자체가 없고
// description 은 빈 문자열, stage/list 는 요금제 미승인("URL is not authorized", 2026-08-27 실측).
// 대신 구조가 결정론적이다: 그룹 순위표(이미 수집)로 팀→조를 알고, **조가 다른 두 팀의
// 경기 = 녹아웃**이며, 시간순 진행에서 각 팀의 직전 라운드 +1 로 라운드가 정해진다.
// 라운드 이름은 1라운드 참가 팀 수로 짓는다(8팀=8강) — 미래 라운드가 아직 수집 전이어도
// 이름이 흔들리지 않는다(끝에서 세면 결승이 8강으로 둔갑한다).
//
// 축구 컵(cup-bracket.ts)은 af round 라벨·ts stageName 이 있어 이 유도가 불필요하다 —
// 이건 라운드 원천이 아예 없는 종목(배구 등 ts 단독 대회)용이다.

export interface KnockoutMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  startTime: Date;
}

export interface KnockoutTie extends KnockoutMatch {
  /** 1 = 첫 녹아웃 라운드 */
  round: number;
  /** 3·4위전 여부 — 두 팀 모두 직전(준결승) 패자 */
  thirdPlace: boolean;
}

export interface KnockoutBracketData {
  /** 라운드 번호 순. 라벨은 roundName() 으로 */
  rounds: { round: number; label: string; ties: KnockoutTie[] }[];
}

/** 1라운드 팀 수 기준 라운드 이름 — 8팀이면 [8강, 준결승, 결승]. */
function roundName(firstRoundTeams: number, round: number): string {
  const teams = firstRoundTeams / 2 ** (round - 1);
  if (teams <= 2) return "결승";
  if (teams <= 4) return "준결승";
  return `${teams}강`;
}

/**
 * groups: 팀 id → 조 이름 (조 편성이 없는 대회면 빈 맵 → null 반환).
 * matches: 대회 전 매치. 반환 null = 녹아웃 없음(조별 진행 중이거나 리그형 대회).
 */
export function deriveKnockout(
  matches: KnockoutMatch[],
  groupOf: Map<number, string>,
): KnockoutBracketData | null {
  if (groupOf.size === 0 || matches.length === 0) return null;

  const sorted = [...matches].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  // 녹아웃 시작 = 첫 크로스 그룹 매치. 그 이후는 같은 조끼리라도 녹아웃(준결승 재대결)이다.
  const firstCross = sorted.find((m) => {
    const g1 = groupOf.get(m.homeTeamId);
    const g2 = groupOf.get(m.awayTeamId);
    return g1 != null && g2 != null && g1 !== g2;
  });
  if (!firstCross) return null;
  const cutoff = firstCross.startTime.getTime();
  const ko = sorted.filter((m) => m.startTime.getTime() >= cutoff);

  // 라운드 진행 유도 — 각 팀의 직전 라운드 +1. 동시에 직전 매치 승패를 기억해 3위전을 가른다.
  const lastRound = new Map<number, number>();
  const lostLast = new Map<number, boolean>();
  const ties: KnockoutTie[] = [];
  let firstRoundTeams = 0;
  for (const m of ko) {
    const r = Math.max(lastRound.get(m.homeTeamId) ?? 0, lastRound.get(m.awayTeamId) ?? 0) + 1;
    const thirdPlace = r > 1 && lostLast.get(m.homeTeamId) === true && lostLast.get(m.awayTeamId) === true;
    ties.push({ ...m, round: r, thirdPlace });
    if (r === 1) firstRoundTeams += 2;
    // 3위전은 진출 사다리 밖 — 라운드 카운터를 올리지 않는다
    if (!thirdPlace) {
      lastRound.set(m.homeTeamId, r);
      lastRound.set(m.awayTeamId, r);
    }
    if (m.status === "FINISHED" && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore) {
      lostLast.set(m.homeTeamId, m.homeScore < m.awayScore);
      lostLast.set(m.awayTeamId, m.awayScore < m.homeScore);
    }
  }
  if (firstRoundTeams < 4) return null; // 크로스 매치 1~2건은 브래킷이라 부르기 어렵다(순위 결정전 등)

  const byRound = new Map<number, KnockoutTie[]>();
  for (const t of ties) {
    const arr = byRound.get(t.round) ?? [];
    arr.push(t);
    byRound.set(t.round, arr);
  }
  return {
    rounds: [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, rts]) => ({ round, label: roundName(firstRoundTeams, round), ties: rts })),
  };
}
